/**
 * The visual stage for the lunch rush. Restaurant rules stay in
 * domain/rushGame.ts; this component only mirrors the current tickets as a
 * toy-like Three.js diorama.
 */

import { createEffect, createSignal, onSettled } from "solid-js";
import * as THREE from "three";
import type { RushState, RushTicket } from "../domain/rushGame";

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/lunch-shift/diorama`;
const ASSETS = {
  room: `${ASSET_BASE}/room-base.webp`,
  poster: `${ASSET_BASE}/poster.webp`,
  chef: `${ASSET_BASE}/chef.webp`,
  clerk: `${ASSET_BASE}/clerk.webp`,
  runner: `${ASSET_BASE}/runner.webp`,
  customer: `${ASSET_BASE}/customer.webp`,
  foreground: `${ASSET_BASE}/foreground.webp`,
} as const;
const FRAME_COUNT = 4;
const ANIMATED_SPRITES = ["chef", "clerk", "runner", "customer", "effect"] as const;
type AnimatedSpriteKey = (typeof ANIMATED_SPRITES)[number];
type FrameTextures = Partial<Record<AnimatedSpriteKey, THREE.Texture[]>>;

type DioramaSnapshot = {
  tickets: RushTicket[];
  tick: number;
  started: boolean;
  playing: boolean;
  automatic: boolean;
};

type TextureSet = Record<keyof Omit<typeof ASSETS, "poster">, THREE.Texture>;
const frameUrls = (key: AnimatedSpriteKey) =>
  Array.from(
    { length: FRAME_COUNT },
    (_, index) => `${ASSET_BASE}/frames/${key}-${index + 1}.webp`,
  );

function loadTexture(
  loader: THREE.TextureLoader,
  renderer: THREE.WebGLRenderer,
  url: string,
): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  });
}

function spriteFrom(texture: THREE.Texture, height: number): THREE.Sprite {
  const image = texture.image as
    { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
  const imageWidth = image?.naturalWidth ?? image?.width ?? 1;
  const imageHeight = image?.naturalHeight ?? image?.height ?? 1;
  const ratio = imageWidth / imageHeight;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set(height * ratio, height, 1);
  return sprite;
}

function setSpriteFrame(
  sprite: THREE.Sprite,
  frames: THREE.Texture[] | undefined,
  frame: number,
): void {
  if (!frames?.length) return;
  const material = sprite.material as THREE.SpriteMaterial;
  const texture = frames[frame % frames.length];
  if (material.map !== texture) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

function roundedPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawTicket(
  context: CanvasRenderingContext2D,
  ticket: RushTicket,
  cardIndex: number,
): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  context.save();
  context.shadowColor = "rgba(74, 45, 21, .22)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  roundedPath(context, 12, 12, width - 24, height - 24, 22);
  context.fillStyle = ticket.urgent ? "#e85a43" : "#fffaf0";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 5;
  context.strokeStyle = ticket.urgent ? "#a92e24" : "#cfb88f";
  context.stroke();

  context.fillStyle = ticket.urgent ? "#fff9ee" : "#554538";
  context.font = "700 20px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(ticket.urgent ? "加急单" : "普通单", 31, 53);

  context.fillStyle = ticket.urgent ? "rgba(255,255,255,.2)" : "#f1e5ce";
  roundedPath(context, 28, 74, width - 56, 116, 16);
  context.fill();
  context.fillStyle = ticket.urgent ? "#fff9ee" : "#33291f";
  context.textAlign = "center";
  context.font = "700 31px system-ui, sans-serif";
  context.fillText(ticket.dish, width / 2, 140);

  context.font = "600 18px system-ui, sans-serif";
  context.fillStyle = ticket.urgent ? "rgba(255,249,238,.85)" : "#806d5d";
  const status =
    ticket.status === "incoming"
      ? "等待接单"
      : ticket.status === "queued"
        ? "等待下锅"
        : ticket.status === "cooking"
          ? "正在制作"
          : ticket.status === "ready"
            ? "等待出餐"
            : "送往餐桌";
  context.fillText(status, width / 2, 221);

  context.fillStyle = ticket.urgent ? "#fff9ee" : "#b94b39";
  context.beginPath();
  context.arc(42, 229, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = ticket.urgent ? "#b94b39" : "#fff9ee";
  context.font = "800 19px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(ticket.id > 99 ? "…" : String(ticket.id), 42, 236);

  context.fillStyle = ticket.urgent ? "rgba(255,249,238,.74)" : "#a28e7b";
  context.font = "600 14px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(`${cardIndex + 1}/3`, width - 30, 235);
  context.restore();
}

function makeSteamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(80, 80, 4, 80, 80, 74);
    gradient.addColorStop(0, "rgba(255,255,255,.88)");
    gradient.addColorStop(0.36, "rgba(255,255,255,.48)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 160, 160);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(96, 40, 4, 96, 40, 92);
    gradient.addColorStop(0, "rgba(54,35,19,.38)");
    gradient.addColorStop(0.52, "rgba(54,35,19,.18)");
    gradient.addColorStop(1, "rgba(54,35,19,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 192, 80);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function RushDiorama(props: {
  state: () => RushState;
  started: () => boolean;
  playing: () => boolean;
  automatic: () => boolean;
}) {
  let hostEl: HTMLDivElement | undefined;
  let canvasEl: HTMLCanvasElement | undefined;
  let syncEngine: (() => void) | undefined;
  const [status, setStatus] = createSignal<"loading" | "ready" | "fallback">("loading");

  const activity = () => {
    const state = props.state();
    const active = state.tickets.filter(
      (ticket) =>
        ticket.arrival <= state.tick && ticket.status !== "served" && ticket.status !== "lost",
    );
    const incoming = active.filter((ticket) => ticket.status === "incoming").length;
    const cooking = active.filter(
      (ticket) => ticket.status === "queued" || ticket.status === "cooking",
    ).length;
    const delivering = active.filter(
      (ticket) => ticket.status === "ready" || ticket.status === "delivering",
    ).length;
    return { incoming, cooking, delivering };
  };

  let snapshot: DioramaSnapshot = {
    tickets: [],
    tick: 0,
    started: false,
    playing: false,
    automatic: false,
  };

  createEffect(
    () => [props.state(), props.started(), props.playing(), props.automatic()] as const,
    ([state, started, playing, automatic]) => {
      snapshot = {
        tickets: state.tickets,
        tick: state.tick,
        started,
        playing,
        automatic,
      };
      syncEngine?.();
    },
  );

  onSettled(() => {
    const host = hostEl;
    const canvas = canvasEl;
    if (!host || !canvas) return;
    if (
      typeof WebGLRenderingContext === "undefined" &&
      typeof WebGL2RenderingContext === "undefined"
    ) {
      setStatus("fallback");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setStatus("fallback");
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 2.8125, -2.8125, 0.1, 30);
    camera.position.set(0, 0.04, 10);
    const stage = new THREE.Group();
    scene.add(stage);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let visible = true;
    let disposed = false;
    let raf = 0;
    let pointerX = 0;
    let pointerY = 0;
    let textures: TextureSet | null = null;
    let chef: THREE.Sprite | null = null;
    let clerk: THREE.Sprite | null = null;
    let runner: THREE.Sprite | null = null;
    let customer: THREE.Sprite | null = null;
    let customerExtras: THREE.Sprite[] = [];
    let stoveEffect: THREE.Sprite | null = null;
    const frames: FrameTextures = {};
    let focusRings: THREE.Mesh[] = [];
    let ticketsGroup: THREE.Group | null = null;
    let ticketMeshes: THREE.Mesh[] = [];
    const ticketContexts: CanvasRenderingContext2D[] = [];
    const ticketTextures: THREE.CanvasTexture[] = [];
    let steamSprites: THREE.Sprite[] = [];
    let steamTexture: THREE.CanvasTexture | null = null;
    let shadowTexture: THREE.CanvasTexture | null = null;
    const starterPositions = {
      chef: new THREE.Vector3(-0.22, -0.5, 0.15),
      clerk: new THREE.Vector3(-3.55, -0.8, 0.28),
      runner: new THREE.Vector3(1.75, -1.05, 0.32),
      customer: new THREE.Vector3(-3.48, -1.95, 1.1),
    };

    const hasIncoming = () =>
      snapshot.tickets.some(
        (ticket) => ticket.arrival <= snapshot.tick && ticket.status === "incoming",
      );
    const hasKitchenWork = () =>
      snapshot.tickets.some((ticket) => ticket.status === "queued" || ticket.status === "cooking");
    const hasDeliveryWork = () =>
      snapshot.tickets.some(
        (ticket) => ticket.status === "ready" || ticket.status === "delivering",
      );

    const activeTickets = () =>
      snapshot.tickets
        .filter(
          (ticket) =>
            ticket.arrival <= snapshot.tick && !["served", "lost"].includes(ticket.status),
        )
        .sort((a, b) => {
          const order: Record<RushTicket["status"], number> = {
            cooking: 0,
            delivering: 1,
            ready: 2,
            queued: 3,
            incoming: 4,
            served: 98,
            lost: 99,
          };
          return order[a.status] - order[b.status] || a.id - b.id;
        })
        .slice(0, 3);

    const syncScene = () => {
      if (!textures || disposed) return;
      const incoming = hasIncoming();
      const kitchen = hasKitchenWork();
      const delivery = hasDeliveryWork();
      const incomingCount = snapshot.tickets.filter(
        (ticket) => ticket.arrival <= snapshot.tick && ticket.status === "incoming",
      ).length;
      if (clerk) clerk.visible = snapshot.started;
      if (chef) chef.visible = snapshot.started;
      if (runner) runner.visible = snapshot.started;
      if (customer) customer.visible = snapshot.started && incoming;
      customerExtras.forEach((sprite, index) => {
        sprite.visible = snapshot.started && incomingCount > index + 1;
      });
      if (stoveEffect) stoveEffect.visible = snapshot.started && kitchen;

      focusRings[0]!.visible = snapshot.started && incoming;
      focusRings[1]!.visible = snapshot.started && kitchen;
      focusRings[2]!.visible = snapshot.started && delivery;
      focusRings.forEach((ring, index) => {
        const active = index === 0 ? incoming : index === 1 ? kitchen : delivery;
        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = active ? 0.72 : 0;
      });

      const cards = activeTickets();
      ticketMeshes.forEach((mesh, index) => {
        const ticket = cards[index];
        mesh.visible = Boolean(ticket);
        if (ticket) drawTicket(ticketContexts[index]!, ticket, index);
        ticketTextures[index]!.needsUpdate = true;
      });
      if (ticketsGroup) ticketsGroup.visible = snapshot.started && cards.length > 0;
    };

    const render = (time = performance.now()) => {
      if (reducedMotion) {
        camera.position.x = 0;
        camera.position.y = 0.04;
        stage.rotation.set(0, 0, 0);
      } else {
        camera.position.x += (pointerX * 0.12 - (camera.position.x - 0)) * 0.08;
        camera.position.y += (0.04 + pointerY * 0.07 - camera.position.y) * 0.08;
        stage.rotation.y = camera.position.x * 0.018;
        stage.rotation.z = camera.position.x * -0.003;
      }

      const seconds = time / 1000;
      const animated = snapshot.playing && !reducedMotion;
      if (chef) {
        setSpriteFrame(
          chef,
          frames.chef,
          animated && hasKitchenWork() ? Math.floor(seconds * 7) : 0,
        );
        chef.position.y =
          starterPositions.chef.y +
          (animated && hasKitchenWork() ? Math.sin(seconds * 8) * 0.035 : 0);
        chef.material.rotation = animated && hasKitchenWork() ? Math.sin(seconds * 5) * 0.018 : 0;
      }
      if (clerk) {
        setSpriteFrame(
          clerk,
          frames.clerk,
          animated && hasIncoming() ? Math.floor(seconds * 5) : 0,
        );
        clerk.position.y =
          starterPositions.clerk.y +
          (animated && hasIncoming() ? Math.sin(seconds * 4 + 1) * 0.025 : 0);
      }
      if (runner) {
        setSpriteFrame(
          runner,
          frames.runner,
          animated && hasDeliveryWork() ? Math.floor(seconds * 10) : 0,
        );
        runner.position.x =
          starterPositions.runner.x +
          (animated && hasDeliveryWork() ? Math.sin(seconds * 7) * 0.13 : 0);
        runner.position.y =
          starterPositions.runner.y +
          (animated && hasDeliveryWork() ? Math.abs(Math.sin(seconds * 14)) * 0.045 : 0);
      }
      if (customer) {
        const customerFrame = animated && hasIncoming() ? Math.floor(seconds * 4) : 0;
        setSpriteFrame(customer, frames.customer, customerFrame);
        customerExtras.forEach((sprite, index) =>
          setSpriteFrame(sprite, frames.customer, customerFrame + index + 1),
        );
        customer.position.y =
          starterPositions.customer.y +
          (animated && hasIncoming() ? Math.sin(seconds * 3.2) * 0.025 : 0);
      }
      focusRings.forEach((ring, index) => {
        const pulse = animated ? 1 + Math.sin(seconds * 5 + index) * 0.055 : 1;
        ring.scale.set(pulse, pulse * 0.35, pulse);
      });
      if (ticketsGroup) {
        ticketsGroup.rotation.z = animated ? Math.sin(seconds * 2.6) * 0.009 : 0;
      }
      if (stoveEffect) {
        setSpriteFrame(
          stoveEffect,
          frames.effect,
          animated && hasKitchenWork() ? Math.floor(seconds * 8) : 0,
        );
      }
      steamSprites.forEach((sprite, index) => {
        if (!animated || !hasKitchenWork() || frames.effect?.length) {
          sprite.visible = false;
          return;
        }
        sprite.visible = true;
        const cycle = (seconds * 0.19 + index / steamSprites.length) % 1;
        sprite.position.set(
          -0.16 + Math.sin(cycle * Math.PI * 2 + index) * 0.13,
          0.95 + cycle * 1.55,
          0.72,
        );
        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity = Math.sin(cycle * Math.PI) * 0.52;
        sprite.scale.setScalar(0.5 + cycle * 0.65);
      });

      renderer.render(scene, camera);
    };

    const loop = (time: number) => {
      if (disposed) return;
      render(time);
      if (snapshot.playing && !reducedMotion && visible && !document.hidden) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };

    const restartLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (snapshot.playing && !reducedMotion && visible && !document.hidden) {
        raf = requestAnimationFrame(loop);
      } else if (!disposed) {
        render();
      }
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.left = -2.8125 * aspect;
      camera.right = 2.8125 * aspect;
      camera.top = 2.8125;
      camera.bottom = -2.8125;
      camera.updateProjectionMatrix();
      render();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === "touch") return;
      const bounds = host.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerY = -((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      if (!snapshot.playing) render();
    };
    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
      if (!snapshot.playing) render();
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      restartLoop();
    };
    const onVisibilityChange = () => restartLoop();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setStatus("fallback");
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    motionQuery.addEventListener("change", onMotionChange);

    // The renderer is intentionally idle off-screen. IntersectionObserver is a
    // broader fallback than relying on GPU-heavy rendering in background tabs.
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        restartLoop();
      },
      { rootMargin: "160px" },
    );
    visibilityObserver.observe(host);

    const loader = new THREE.TextureLoader();
    void Promise.all([
      loadTexture(loader, renderer, ASSETS.room),
      loadTexture(loader, renderer, ASSETS.chef),
      loadTexture(loader, renderer, ASSETS.clerk),
      loadTexture(loader, renderer, ASSETS.runner),
      loadTexture(loader, renderer, ASSETS.customer),
      loadTexture(loader, renderer, ASSETS.foreground),
    ])
      .then(
        ([room, chefTexture, clerkTexture, runnerTexture, customerTexture, foregroundTexture]) => {
          if (disposed) return;
          textures = {
            room,
            chef: chefTexture,
            clerk: clerkTexture,
            runner: runnerTexture,
            customer: customerTexture,
            foreground: foregroundTexture,
          };

          const roomMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 5.625),
            new THREE.MeshBasicMaterial({
              map: room,
              transparent: true,
              alphaTest: 0.01,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          roomMesh.position.set(0, 0, -0.8);
          stage.add(roomMesh);

          shadowTexture = makeShadowTexture();
          const shadowGeometry = new THREE.PlaneGeometry(1.18, 0.42);
          const addShadow = (x: number, y: number) => {
            const shadow = new THREE.Mesh(
              shadowGeometry,
              new THREE.MeshBasicMaterial({
                map: shadowTexture,
                transparent: true,
                depthWrite: false,
                toneMapped: false,
              }),
            );
            shadow.position.set(x, y, 0.02);
            stage.add(shadow);
          };
          addShadow(-3.55, -0.84);
          addShadow(-0.22, -0.62);
          addShadow(1.75, -1.23);
          addShadow(-3.48, -2.0);

          const ringGeometry = new THREE.RingGeometry(0.46, 0.58, 48);
          focusRings = [
            [-3.55, -0.67, 0.04],
            [-0.22, -0.38, 0.04],
            [1.75, -0.92, 0.04],
          ].flatMap(([x, y, z]) => {
            const ring = new THREE.Mesh(
              ringGeometry,
              new THREE.MeshBasicMaterial({
                color: 0xf6c95d,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                side: THREE.DoubleSide,
              }),
            );
            ring.position.set(x, y, z);
            ring.scale.y = 0.35;
            stage.add(ring);
            return [ring];
          });

          clerk = spriteFrom(clerkTexture, 2.55);
          clerk.position.copy(starterPositions.clerk);
          stage.add(clerk);

          chef = spriteFrom(chefTexture, 2.5);
          chef.position.copy(starterPositions.chef);
          stage.add(chef);

          runner = spriteFrom(runnerTexture, 2.55);
          runner.position.copy(starterPositions.runner);
          stage.add(runner);

          customer = spriteFrom(customerTexture, 2.55);
          customer.position.copy(starterPositions.customer);
          stage.add(customer);
          customerExtras = [
            { height: 2.08, position: new THREE.Vector3(-3.98, -2.16, 0.48), tint: 0xd7e9dc },
            { height: 1.78, position: new THREE.Vector3(-3.7, -1.55, 0.38), tint: 0xf0c9aa },
          ].map(({ height, position, tint }) => {
            const sprite = spriteFrom(customerTexture, height);
            sprite.position.copy(position);
            const material = sprite.material as THREE.SpriteMaterial;
            material.color.setHex(tint);
            material.opacity = 0.82;
            sprite.visible = false;
            stage.add(sprite);
            addShadow(position.x, position.y - 0.015);
            return sprite;
          });

          const foreground = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 3.59375),
            new THREE.MeshBasicMaterial({
              map: foregroundTexture,
              transparent: true,
              alphaTest: 0.01,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          // The crop corresponds to x=60..1180, y=250..825 in the 1600×900 room.
          foreground.position.set(-1.125, -0.546875, 0.78);
          stage.add(foreground);

          ticketsGroup = new THREE.Group();
          ticketsGroup.position.set(-0.2, 1.58, 0.9);
          stage.add(ticketsGroup);
          ticketMeshes = [0, 1, 2].map((index) => {
            const card = document.createElement("canvas");
            card.width = 240;
            card.height = 280;
            const context = card.getContext("2d");
            if (!context) throw new Error("Unable to create ticket canvas");
            const texture = new THREE.CanvasTexture(card);
            texture.colorSpace = THREE.SRGBColorSpace;
            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(0.92, 1.073),
              new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                toneMapped: false,
              }),
            );
            mesh.position.set((index - 1) * 0.98, Math.abs(index - 1) * 0.08, index * 0.01);
            mesh.rotation.z = (index - 1) * 0.035;
            ticketContexts.push(context);
            ticketTextures.push(texture);
            ticketsGroup!.add(mesh);
            return mesh;
          });

          steamTexture = makeSteamTexture();
          steamSprites = Array.from({ length: 5 }, () => {
            const material = new THREE.SpriteMaterial({
              map: steamTexture,
              transparent: true,
              depthWrite: false,
              toneMapped: false,
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(-0.16, 0.9, 0.7);
            stage.add(sprite);
            return sprite;
          });

          syncScene();
          setStatus("ready");
          resize();
          restartLoop();

          void Promise.allSettled(
            ANIMATED_SPRITES.map(async (key) => ({
              key,
              textures: await Promise.all(
                frameUrls(key).map((url) => loadTexture(loader, renderer, url)),
              ),
            })),
          ).then((results) => {
            if (disposed) {
              results.forEach((result) => {
                if (result.status === "fulfilled") {
                  result.value.textures.forEach((texture) => texture.dispose());
                }
              });
              return;
            }
            results.forEach((result) => {
              if (result.status === "fulfilled") {
                frames[result.value.key] = result.value.textures;
              }
            });
            if (frames.effect?.length) {
              stoveEffect = spriteFrom(frames.effect[0]!, 1.55);
              stoveEffect.position.set(0.34, -0.12, 0.96);
              stage.add(stoveEffect);
            }
            syncScene();
            restartLoop();
          });
        },
      )
      .catch(() => {
        if (!disposed) setStatus("fallback");
      });

    syncEngine = () => {
      if (textures && !disposed) {
        syncScene();
        restartLoop();
      }
    };

    return () => {
      disposed = true;
      syncEngine = undefined;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      motionQuery.removeEventListener("change", onMotionChange);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach((item) => item.dispose());
          } else {
            material.dispose();
          }
          if (object instanceof THREE.Mesh) object.geometry.dispose();
        }
      });
      Object.values(textures ?? {}).forEach((texture) => texture.dispose());
      Object.values(frames).forEach((group) => group?.forEach((texture) => texture.dispose()));
      steamTexture?.dispose();
      shadowTexture?.dispose();
      ticketTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
    };
  });

  const summary = () => {
    if (!props.started()) return "打烊中的玩具餐馆，点开门按钮开始午高峰";
    if (!props.playing()) return "暂停中的玩具餐馆";
    const active = activity();
    return `玩具餐馆营业中：${active.incoming} 单等待接单，${active.cooking} 单在厨房，${active.delivering} 单在出餐`;
  };

  return (
    <div
      class={`rush-diorama${status() === "ready" ? " is-ready" : ""}${
        status() === "fallback" ? " is-fallback" : ""
      }`}
      ref={(element) => {
        hostEl = element;
      }}
    >
      <canvas
        aria-label={summary()}
        class="rush-diorama-canvas"
        ref={(element) => {
          canvasEl = element;
        }}
        role="img"
      />
      <img alt="" aria-hidden="true" class="rush-diorama-poster" src={ASSETS.poster} />
      <div aria-hidden="true" class="rush-diorama-vignette" />
      <div aria-hidden="true" class="rush-diorama-chip">
        <span class="rush-diorama-live-dot" />
        {props.started()
          ? props.playing()
            ? props.automatic()
              ? "自动排单机接管中"
              : "午市营业中"
            : "营业暂停"
          : "小满餐馆 · 尚未开门"}
      </div>
      <div aria-hidden="true" class="rush-diorama-counts">
        <span>接单 {activity().incoming}</span>
        <span>厨房 {activity().cooking}</span>
        <span>出餐 {activity().delivering}</span>
      </div>
    </div>
  );
}
