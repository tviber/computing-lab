/**
 * Run-result rendering — port of the kitchen result card: score vs
 * baseline, who-waited line, per-order table with "谁定的" field traces,
 * the queue pick explanations, and a static three-station event feed.
 */

import { useEffect, useState } from "react";
import {
  FOCUS_LABELS,
  type OrderResult,
  type RunSummary,
  type SimulationEvent,
} from "../domain/contracts.ts";
import type { RunTrace } from "../domain/protocol.ts";
import { SimMap } from "./SimMap.tsx";

const ACTION_LABELS: Record<SimulationEvent["action"], string> = {
  arrive: "新单到达",
  ticket: "小票已录入",
  held: "订单暂缓",
  cook: "开始制作",
  ready: "制作完成",
  send: "出餐配送",
};

const STATIONS = [
  { stage: "intake" as const, label: "前台接单" },
  { stage: "kitchen" as const, label: "厨房制作" },
  { stage: "delivery" as const, label: "出餐配送" },
];

const FIELD_LABELS: Record<string, string> = {
  item: "菜品",
  table: "桌号",
  note: "备注",
  urgent: "加急",
};

function isUrgentRequest(request: string): boolean {
  return /赶时间|急着|快一点|尽快/.test(request) && !/不赶时间|不急着|不用急/.test(request);
}

function UsersLine({ result }: { result: RunSummary }) {
  const late = result.orders.filter((order) => order.delivered && !order.onTime);
  const undelivered = result.orders.filter((order) => !order.delivered);
  const longest = result.orders
    .filter((order) => order.delivered)
    .reduce<OrderResult | null>(
      (top, order) => (top && top.wait >= order.wait ? top : order),
      null,
    );
  const wrongOrders = result.orders.filter((order) => order.correct === false);
  const unrecognized = wrongOrders.filter((order) => order.item === "" || order.table === "");
  return (
    <div className="lunch-users-line">
      <p>
        这一轮有 {late.length} 位顾客等超了目标
        {late.length
          ? `，其中 ${late.filter((order) => isUrgentRequest(order.request)).length} 位在原话里催过`
          : ""}
        {undelivered.length ? `；还有 ${undelivered.length} 单没送出去` : ""}。
        {longest ? `等得最久的是 ${longest.id}（${longest.wait} 拍）。` : ""}
      </p>
      {wrongOrders.length ? (
        <p>
          {wrongOrders.length} 张小票录错
          {unrecognized.length ? `，其中 ${unrecognized.length} 张连菜品或桌号都没认出来` : ""}。
        </p>
      ) : null}
      <p className="lunch-note">最挤的一站：{FOCUS_LABELS[result.bottleneck]}。</p>
    </div>
  );
}

function eventSummary(event: SimulationEvent, order: OrderResult | undefined): string {
  if (!order) return "";
  if (event.stage === "intake") {
    if (event.action === "ticket") {
      return `${order.table || "未认出桌号"} 号桌 · ${order.item || "未认出菜品"} · 备注「${order.note || "未认出"}」`;
    }
    return event.action === "held" ? "小票信息不完整，未进入厨房队列" : "顾客订单到达";
  }
  if (event.stage === "kitchen") {
    return event.action === "ready"
      ? `${order.item || "未认出菜品"}做好了 · ${order.table || "未认出桌号"} 号桌`
      : `${order.item || "未认出菜品"} · 备注「${order.note || "无备注"}」`;
  }
  return `${order.item || "未认出菜品"} → ${order.table || "未认出桌号"} 号桌`;
}

function EventFeed({ result, trace }: { result: RunSummary; trace?: RunTrace | null }) {
  const events = result.events ?? [];
  if (events.length === 0) return null;
  const orderById = new Map(result.orders.map((order) => [order.id, order]));
  const queueTrace = trace?.queue ?? [];
  return (
    <div className="lunch-simulation" aria-label="订单处理回放">
      {STATIONS.map((station) => (
        <article className="lunch-station" key={station.stage}>
          <b>{station.label}</b>
          <div className="lunch-station-feed">
            {events
              .filter((event) => event.stage === station.stage)
              .map((event, index) => {
                const order = orderById.get(event.orderId);
                const decision = queueTrace.find(
                  (item) =>
                    item.stage === station.stage &&
                    item.tick === event.tick &&
                    item.picked === event.orderId,
                );
                return (
                  <div className="lunch-event" key={`${event.orderId}-${index}`}>
                    <b>
                      第 {event.tick} 拍 · {event.orderId} ·{" "}
                      {ACTION_LABELS[event.action] ?? "处理订单"}
                    </b>
                    <span>{eventSummary(event, order)}</span>
                    {decision ? <small>选单原因：{decision.why}</small> : null}
                  </div>
                );
              })}
          </div>
        </article>
      ))}
    </div>
  );
}

export function RunResultView({
  title,
  run,
  baseline,
  trace,
}: {
  title: string;
  run: RunSummary;
  baseline?: RunSummary | null;
  trace?: RunTrace | null;
}) {
  const delta = run.score !== null && baseline?.score != null ? run.score - baseline.score : null;
  const comparison =
    delta === null
      ? "规则已运行。"
      : delta > 0
        ? `比原来的规则提高了 ${delta} 分！`
        : delta < 0
          ? `比原来的规则低 ${Math.abs(delta)} 分；试着调整规则顺序。`
          : "和原来的规则一样；试试改变一条规则。";
  const baselineOrders = new Map((baseline?.orders ?? []).map((order) => [order.id, order]));
  const fixed = run.orders.find(
    (order) => order.correct === true && baselineOrders.get(order.id)?.correct === false,
  );
  const faster = run.orders.find((order) => {
    const original = baselineOrders.get(order.id);
    return order.delivered && original?.delivered && order.wait < original.wait;
  });
  const impact = fixed
    ? `${fixed.id} 的小票现在识别正确。`
    : faster
      ? `${faster.id} 比原来提前 ${(baselineOrders.get(faster.id)?.wait ?? 0) - faster.wait} 拍送达。`
      : `正确小票 ${run.correct} / ${run.orders.length} · 准时送达 ${run.onTime} / ${run.orders.length}。`;

  const events = run.events ?? [];
  const duration = events.length ? Math.max(...events.map((event) => event.tick)) : 0;
  const wrongIds = run.orders.filter((order) => order.correct === false).map((order) => order.id);
  // If a ticket went wrong, the replay opens on the tick where it was
  // recorded — the student sees where it entered the pipeline.
  const firstWrong = wrongIds[0];
  const startTick = firstWrong
    ? (events.find((event) => event.orderId === firstWrong && event.action === "ticket")?.tick ??
      events.find((event) => event.orderId === firstWrong)?.tick ??
      0)
    : 0;
  const [tick, setTick] = useState(startTick);
  const [playing, setPlaying] = useState(true);

  // Autoplay the replay once per run; the slider pauses it.
  useEffect(() => {
    setTick(startTick);
    setPlaying(true);
  }, [run]);
  useEffect(() => {
    if (!playing || duration === 0) return;
    const timer = window.setInterval(() => {
      setTick((current) => {
        if (current >= duration) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 480);
    return () => window.clearInterval(timer);
  }, [playing, duration, run]);

  const tickEvents = events.filter((event) => event.tick === tick);
  const caption = tickEvents.length
    ? `第 ${tick} 拍：${tickEvents.map((event) => `${event.orderId} ${ACTION_LABELS[event.action]}`).join("；")}`
    : tick
      ? `第 ${tick} 拍：各站等待队列或岗位空闲。`
      : "正在准备回放。";

  return (
    <section className="lunch-result" role="status">
      <p className="eyebrow">{title}</p>
      <h3>{run.score === null ? "运行完成" : `${run.score} / 100 分`}</h3>
      <p>
        <b>{comparison}</b> {impact}
      </p>
      {duration > 0 ? (
        <div className="lunch-replay">
          <SimMap highlightIds={wrongIds} run={run} tick={tick} trace={trace} />
          <div className="lunch-replay-controls">
            <button
              className="button button-secondary"
              onClick={() => setPlaying((value) => !value)}
              type="button"
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setTick(0);
                setPlaying(true);
              }}
              type="button"
            >
              从头播放
            </button>
            <label className="lunch-replay-range">
              时间轴
              <input
                aria-label="订单回放时间轴"
                max={duration}
                min={0}
                onChange={(e) => {
                  setPlaying(false);
                  setTick(Number(e.currentTarget.value) || 0);
                }}
                type="range"
                value={tick}
              />
            </label>
            <strong aria-live="polite">
              {tick ? `第 ${tick} 拍 / ${duration} 拍` : `准备开始 · 共 ${duration} 拍`}
            </strong>
          </div>
          <p className="lunch-replay-caption" aria-live="polite">
            {caption}
            {wrongIds.length ? ` 红框闪动的是录错的小票：${wrongIds.join("、")}。` : ""}
          </p>
        </div>
      ) : null}
      <div className="lunch-stat-row" aria-label="本轮关键指标">
        <span>
          <b>
            {run.correct} / {run.orders.length}
          </b>
          小票正确
        </span>
        <span>
          <b>
            {run.onTime} / {run.orders.length}
          </b>
          准时送达
        </span>
        <span>
          <b>
            {run.delivered} / {run.orders.length}
          </b>
          实际送达
        </span>
        <span>
          <b>{run.averageWait} 拍</b>
          平均等待
        </span>
        <span>
          <b>{FOCUS_LABELS[run.bottleneck]}</b>
          最挤的一站
        </span>
      </div>
      <UsersLine result={run} />
      <details>
        <summary>查看每张订单</summary>
        <div className="lunch-table-wrap">
          <table className="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>识别结果</th>
                <th>小票</th>
                <th>等待</th>
              </tr>
            </thead>
            <tbody>
              {run.orders.map((order) => {
                const ticketPoints = order.correct ? 50 : 0;
                const onTimePoints = order.onTime ? 25 : 0;
                const waitPoints = Math.max(0, order.points - ticketPoints - onTimePoints);
                const fieldTrace = trace?.orders[order.id];
                return (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                      <small>{order.request}</small>
                    </td>
                    <td>
                      {order.item || "未识别"} · {order.note || "—"} · {order.table || "—"} 号桌
                      {fieldTrace ? (
                        <details className="lunch-field-trace">
                          <summary>谁定的？</summary>
                          <ul>
                            {["item", "table", "note", "urgent"].map((field) => (
                              <li key={field}>
                                <b>{FIELD_LABELS[field]}</b>
                                {fieldTrace[field]}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td>{order.correct ? "正确 50" : "有误 0"}</td>
                    <td>
                      {order.delivered ? (
                        <>
                          {order.wait} 拍{order.onTime ? "（准时）" : "（超时）"}
                          <small>
                            准时 {onTimePoints} · 等待 {Math.round(waitPoints * 10) / 10}
                          </small>
                        </>
                      ) : (
                        "未送达"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>展开三站处理回放</summary>
        <EventFeed result={run} trace={trace} />
        {trace && trace.queue.length > 0 ? (
          <details className="lunch-field-trace">
            <summary>厨房和出餐为什么先做这一张？</summary>
            <ul>
              {trace.queue.map((item, index) => (
                <li key={`${item.stage}-${item.tick}-${index}`}>
                  <b>
                    {item.stage === "kitchen" ? "厨房" : "出餐"} · 第 {item.tick} 拍
                  </b>
                  选了 {item.picked}：{item.why}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </details>
    </section>
  );
}
