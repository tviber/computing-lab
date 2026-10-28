/**
 * 2.5D top-down replay of a lunch-shift run on the generated restaurant
 * map. Each order's position is derived from the recorded event stream at
 * the current tick — the canvas animates the flow, it never re-runs the
 * simulation. Images live in public/assets/lunch-shift/.
 */

import { useEffect, useRef } from "react";
import type { OrderResult, RunSummary } from "../domain/contracts.ts";
import type { RunTrace } from "../domain/protocol.ts";

const BASE = "/assets/lunch-shift";
const W = 960;
const H = 640;

type SpriteKey = "cook" | "customer" | "runner" | "map" | "front";

const SOURCES: Record<SpriteKey, string> = {
  map: `${BASE}/simulation-kitchen-map.png`,
  front: `${BASE}/simulation-front-staff.png`,
  cook: `${BASE}/sim-cook-4frames.png`,
  customer: `${BASE}/sim-customer-4frames.png`,
  runner: `${BASE}/sim-delivery-4frames.png`,
};

const DISH_SRC: Record<string, string> = {
  鸡腿饭: `${BASE}/chicken.png`,
  蛋炒饭: `${BASE}/friedrice.png`,
  牛肉面: `${BASE}/noodle.png`,
};

// Zone anchors on the logical canvas.
const Z = {
  frontStaff: { x: 235, y: 150, w: 92 },
  queueHead: { x: 120, y: 330 },
  queueSlot: 52,
  held: { x: 60, y: 70, dx: 76 },
  kqueue: { x: 400, y: 300, dy: 46 },
  stoves: [
    { x: 505, y: 235 },
    { x: 505, y: 350 },
  ],
  cook: { x: 560, y: 170, w: 96 },
  pass: { x: 660, y: 300, dx: 72 },
  runner: { x: 700, y: 180, w: 92 },
  tables: { x: 865, y: 120, dy: 52 },
};

const INK = "#26251f";
const MUTED = "#77766e";
const TOMATO = "#cb4c38";
const YELLOW = "#dfad4f";

type OrderTimeline = {
  arrive?: number;
  ticket?: number;
  held?: number;
  cook?: number;
  ready?: number;
  send?: number;
};

function buildTimeline(run: RunSummary): Map<string, OrderTimeline> {
  const map = new Map<string, OrderTimeline>();
  for (const event of run.events ?? []) {
    const entry = map.get(event.orderId) ?? {};
    if (entry[event.action as keyof OrderTimeline] === undefined) {
      (entry as Record<string, number>)[event.action] = event.tick;
    }
    map.set(event.orderId, entry);
  }
  return map;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Loaded = Record<SpriteKey, HTMLImageElement> & { dish: Record<string, HTMLImageElement> };

function spriteFrame(img: HTMLImageElement, frame: number) {
  const cell = img.naturalWidth / 2; // 2×2 sprite sheet
  return { cell, sx: (frame & 1) * cell, sy: ((frame >> 1) & 1) * cell };
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  frame: number,
) {
  if (!img.complete || !img.naturalWidth) return;
  const { cell, sx, sy } = spriteFrame(img, frame);
  ctx.drawImage(img, sx, sy, cell, cell, x, y, w, w);
}

function drawWhole(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
) {
  if (!img.complete || !img.naturalWidth) return;
  ctx.drawImage(img, x, y, w, (w * img.naturalHeight) / img.naturalWidth);
}

function chip(
  ctx: CanvasRenderingContext2D,
  img: Loaded,
  order: OrderResult,
  x: number,
  y: number,
  opts: { alpha?: number; flash?: number; held?: boolean } = {},
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  rr(ctx, x, y, 74, 40, 8);
  ctx.fillStyle = opts.held ? "#efe9dd" : "#fffdf8";
  ctx.fill();
  ctx.lineWidth = order.urgent ? 2 : 1;
  ctx.strokeStyle = opts.held ? MUTED : order.urgent ? TOMATO : "#d9cfbd";
  ctx.stroke();
  const dish = img.dish[order.item];
  if (dish?.complete && dish.naturalWidth) ctx.drawImage(dish, x + 3, y + 6, 28, 28);
  ctx.fillStyle = INK;
  ctx.font = "700 11px sans-serif";
  ctx.fillText(order.id, x + 34, y + 16);
  ctx.fillStyle = MUTED;
  ctx.font = "10px sans-serif";
  ctx.fillText(order.table ? `${order.table}号桌` : "?号桌", x + 34, y + 31);
  if (opts.flash !== undefined) {
    rr(ctx, x - 3, y - 3, 80, 46, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(203,76,56,${0.45 + 0.45 * Math.abs(Math.sin(opts.flash))})`;
    ctx.stroke();
  }
  ctx.restore();
}

function zoneBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = "700 12px sans-serif";
  ctx.fillStyle = "rgba(38,37,31,.82)";
  ctx.fillText(text, x, y);
}

type Lanes = Record<"queue" | "held" | "kqueue" | "stoves" | "pass" | "tables", OrderResult[]>;

function lanesAt(orders: OrderResult[], timeline: Map<string, OrderTimeline>, tick: number): Lanes {
  const lanes: Lanes = { queue: [], held: [], kqueue: [], stoves: [], pass: [], tables: [] };
  for (const order of orders) {
    const tl = timeline.get(order.id) ?? {};
    if (tl.arrive === undefined || tick < tl.arrive) continue;
    if (tl.held !== undefined && tick >= tl.held) lanes.held.push(order);
    else if (tl.send !== undefined && tick >= tl.send) lanes.tables.push(order);
    else if (tl.ready !== undefined && tick >= tl.ready) lanes.pass.push(order);
    else if (tl.cook !== undefined && tick >= tl.cook) lanes.stoves.push(order);
    else if (tl.ticket !== undefined && tick >= tl.ticket) lanes.kqueue.push(order);
    else lanes.queue.push(order);
  }
  return lanes;
}

export function SimMap({
  highlightIds,
  run,
  trace,
  tick,
}: {
  /** Order ids whose tickets went wrong — pulsing red ring on their chips. */
  highlightIds?: string[];
  run: RunSummary;
  trace?: RunTrace | null;
  tick: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const img = { dish: {} as Loaded["dish"] } as Loaded;
    for (const [key, src] of Object.entries(SOURCES)) {
      img[key as SpriteKey] = new Image();
      img[key as SpriteKey].src = src;
    }
    for (const [dish, src] of Object.entries(DISH_SRC)) {
      img.dish[dish] = new Image();
      img.dish[dish].src = src;
    }

    const timeline = buildTimeline(run);
    const queueTrace = trace?.queue ?? [];
    const highlight = new Set(highlightIds ?? []);
    let raf = 0;
    let alive = true;

    const draw = (tick: number) => {
      ctx.clearRect(0, 0, W, H);
      if (img.map.complete && img.map.naturalWidth) {
        ctx.drawImage(img.map, 0, 0, W, H);
      } else {
        ctx.fillStyle = "#f3ead9";
        ctx.fillRect(0, 0, W, H);
      }

      const lanes = lanesAt(run.orders, timeline, tick);
      const frame = Math.floor(performance.now() / 220) % 4;

      zoneBadge(ctx, "柜台 · 接单", Z.frontStaff.x - 60, 130);
      zoneBadge(ctx, "厨房 · 灶台", Z.stoves[0].x - 20, 215);
      zoneBadge(ctx, "出餐台 · 配送", Z.pass.x - 10, 285);
      zoneBadge(ctx, "餐桌", Z.tables.x - 8, 105);

      drawWhole(ctx, img.front, Z.frontStaff.x, Z.frontStaff.y, Z.frontStaff.w);
      drawSprite(ctx, img.cook, Z.cook.x, Z.cook.y, Z.cook.w, lanes.stoves.length ? frame : 0);
      const recentSend = lanes.tables.some((order) => {
        const sent = timeline.get(order.id)?.send;
        return sent !== undefined && tick >= sent && tick - sent <= 2;
      });
      drawSprite(ctx, img.runner, Z.runner.x, Z.runner.y, Z.runner.w, recentSend ? frame : 0);

      if (lanes.queue.length) {
        drawSprite(ctx, img.customer, Z.queueHead.x - 30, Z.queueHead.y - 60, 84, frame);
      }
      lanes.queue.forEach((order, i) =>
        chip(ctx, img, order, Z.queueHead.x + 40, Z.queueHead.y - 40 + i * Z.queueSlot, {
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        }),
      );
      lanes.held.forEach((order, i) =>
        chip(ctx, img, order, Z.held.x + i * Z.held.dx, Z.held.y, {
          held: true,
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        }),
      );
      if (lanes.held.length) zoneBadge(ctx, "拦下的小票", Z.held.x, Z.held.y - 10);
      lanes.kqueue.forEach((order, i) =>
        chip(ctx, img, order, Z.kqueue.x, Z.kqueue.y + i * Z.kqueue.dy, {
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        }),
      );
      lanes.stoves.forEach((order, i) => {
        const slot = Z.stoves[i % Z.stoves.length];
        chip(ctx, img, order, slot.x, slot.y, {
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        });
        ctx.fillStyle = YELLOW;
        ctx.beginPath();
        ctx.arc(slot.x + 8, slot.y + 8, 5 + (frame % 2), 0, Math.PI * 2);
        ctx.fill();
      });
      lanes.pass.forEach((order, i) =>
        chip(ctx, img, order, Z.pass.x + i * Z.pass.dx, Z.pass.y, {
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        }),
      );
      lanes.tables.forEach((order, i) =>
        chip(ctx, img, order, Z.tables.x, Z.tables.y + i * Z.tables.dy, {
          alpha: 0.85,
          flash: highlight.has(order.id) ? performance.now() / 300 : undefined,
        }),
      );

      const picks = queueTrace.filter((item) => item.tick === tick).slice(0, 2);
      for (const pick of picks) {
        const anchor = pick.stage === "kitchen" ? Z.stoves[0] : Z.pass;
        const text = `选 ${pick.picked}：${pick.why}`;
        ctx.font = "11px sans-serif";
        const wText = Math.min(ctx.measureText(text).width + 20, 300);
        rr(ctx, anchor.x - 10, anchor.y - 46, wText, 26, 8);
        ctx.fillStyle = "rgba(255,240,233,.96)";
        ctx.fill();
        ctx.strokeStyle = TOMATO;
        ctx.stroke();
        ctx.fillStyle = TOMATO;
        ctx.fillText(text.length > 42 ? `${text.slice(0, 42)}…` : text, anchor.x, anchor.y - 28);
      }

      ctx.font = "600 11px sans-serif";
      ctx.fillStyle = MUTED;
      if (!tick) {
        ctx.fillText("准备开始 — 按「播放」看订单流过三站", 20, H - 18);
      } else if (
        lanes.queue.length + lanes.kqueue.length + lanes.pass.length === 0 &&
        lanes.tables.length < run.orders.length
      ) {
        ctx.fillText("各站等待队列或岗位空闲", 20, H - 18);
      }
    };

    const loop = () => {
      if (!alive) return;
      draw(tickRef.current);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // Images and timeline rebuild only when the run/trace change; the loop
    // reads the latest tick through tickRef.
  }, [run, trace, highlightIds]);

  return (
    <canvas
      aria-label="餐馆俯视图：订单从柜台到厨房再到出餐的动画回放"
      className="lunch-map-2d"
      height={H}
      ref={canvasRef}
      role="img"
      width={W}
    />
  );
}
