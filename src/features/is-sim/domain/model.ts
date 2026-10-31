/**
 * Is-sim topology model: the student's "draft" is a device graph — a
 * bounded list of nodes (采集点/网关/数据库/执行器/看板/人工位) placed on
 * a small grid, plus directed data-flow links into typed in-ports.
 *
 * Design rules that fall out of the model and are enforced here:
 * - Every in-port accepts a single driver. Wiring a second source into
 *   `{to, port}` replaces the previous link, both in the UI and in
 *   `sanitizeTopology`, so merges must be expressed through gateway
 *   [a,b] ports or fanned out on a source's `out` port.
 * - `fixed` nodes are stage furniture: prefill devices the scenario can
 *   reference by id. Students can relabel/rewire them but not delete
 *   them.
 * - Parameter values are clamped to a per-kind spec at the domain
 *   boundary — UI and server never trust the wire shape.
 */

export type IsNodeKind = "sensor" | "gateway" | "db" | "actuator" | "dashboard" | "human";

export const NODE_KINDS: readonly IsNodeKind[] = [
  "sensor",
  "gateway",
  "db",
  "actuator",
  "dashboard",
  "human",
];

export const KIND_LABEL: Record<IsNodeKind, string> = {
  sensor: "采集点",
  gateway: "网关",
  db: "数据库",
  actuator: "执行器",
  dashboard: "看板",
  human: "人工位",
};

/** Wireable ports; `out` is the single emit port every producer has. */
export const NODE_PORTS: Record<IsNodeKind, { in: readonly string[]; out: readonly string[] }> = {
  sensor: { in: [], out: ["out"] },
  gateway: { in: ["a", "b"], out: ["out"] },
  db: { in: ["write", "query", "delete"], out: ["result"] },
  actuator: { in: ["in"], out: ["out"] },
  dashboard: { in: ["in"], out: [] },
  human: { in: ["in"], out: ["out"] },
};

export const PORT_LABEL: Record<string, string> = {
  a: "a 口",
  b: "b 口",
  in: "输入",
  out: "输出",
  write: "写入",
  query: "查询",
  delete: "删除",
  result: "结果",
  emit: "触发",
  $due: "核准",
};

export type IsNodeParams = {
  interval?: number;
  base?: number;
  noise?: number;
  delay?: number;
  dropRate?: number;
  threshold?: number;
  workDelay?: number;
};

export type IsNode = {
  id: string;
  kind: IsNodeKind;
  label: string;
  x: number;
  y: number;
  /** Stage furniture: may not be deleted. */
  fixed: boolean;
  /** Params frozen by the stage (e.g. a calibrated sensor the script drives). */
  fixedParams?: boolean;
  params: IsNodeParams;
};

export type IsLink = {
  from: string;
  to: string;
  port: string;
};

export type IsTopology = {
  nodes: IsNode[];
  links: IsLink[];
};

export type IsDraft = IsTopology;

export const MAX_DEVICES = 8;
export const GRID_COLS = 4;
export const GRID_ROWS = 2;

export type IsParamSpec = {
  key: keyof IsNodeParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  integer?: boolean;
  hint?: string;
};

export const NODE_PARAMS: Record<IsNodeKind, readonly IsParamSpec[]> = {
  sensor: [
    {
      key: "interval",
      label: "采集间隔",
      min: 0,
      max: 64,
      step: 1,
      integer: true,
      unit: "拍",
      hint: "0 = 不自动采集",
    },
    { key: "base", label: "读数基准", min: -999, max: 999, step: 1 },
    { key: "noise", label: "噪声幅度", min: 0, max: 100, step: 1 },
  ],
  gateway: [
    { key: "delay", label: "转发延迟", min: 0, max: 8, step: 1, integer: true, unit: "拍" },
    { key: "dropRate", label: "丢包率", min: 0, max: 1, step: 0.05, hint: "随机丢弃比例" },
  ],
  db: [],
  actuator: [
    {
      key: "threshold",
      label: "触发阈值",
      min: -999,
      max: 999,
      step: 1,
      hint: "读数 ≥ 阈值时动作",
    },
  ],
  dashboard: [],
  human: [
    { key: "workDelay", label: "处理耗时", min: 1, max: 16, step: 1, integer: true, unit: "拍" },
  ],
};

export function defaultParamsFor(kind: IsNodeKind): IsNodeParams {
  switch (kind) {
    case "sensor":
      return { interval: 2, base: 50, noise: 0 };
    case "gateway":
      return { delay: 0, dropRate: 0 };
    case "actuator":
      return { threshold: 50 };
    case "human":
      return { workDelay: 2 };
    default:
      return {};
  }
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,16}$/;
const MAX_LABEL = 24;

function clampNumber(value: unknown, spec: IsParamSpec): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  let v = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.integer) v = Math.round(v);
  else v = Math.round(v / spec.step) * spec.step;
  return v;
}

function sanitizeParamMap(kind: IsNodeKind, params: unknown): IsNodeParams {
  if (typeof params !== "object" || params === null) return {};
  const raw = params as Record<string, unknown>;
  const out: IsNodeParams = {};
  for (const spec of NODE_PARAMS[kind]) {
    const v = clampNumber(raw[spec.key], spec);
    if (v !== null) out[spec.key] = v;
  }
  return out;
}

/**
 * Normalize any incoming shape into a valid topology: dedupe node ids,
 * clamp grid positions and params, drop links with invalid endpoints or
 * ports, and collapse multi-driver ports to their last link.
 */
export function sanitizeTopology(draft: unknown): IsTopology {
  const source = (typeof draft === "object" && draft !== null ? draft : {}) as {
    nodes?: unknown;
    links?: unknown;
  };
  const nodes: IsNode[] = [];
  const seen = new Set<string>();
  if (Array.isArray(source.nodes)) {
    for (const raw of source.nodes) {
      if (nodes.length >= MAX_DEVICES) break;
      if (typeof raw !== "object" || raw === null) continue;
      const candidate = raw as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : "";
      if (!ID_PATTERN.test(id) || seen.has(id)) continue;
      const kind = NODE_KINDS.includes(candidate.kind as IsNodeKind)
        ? (candidate.kind as IsNodeKind)
        : null;
      if (!kind) continue;
      seen.add(id);
      const label =
        typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim().slice(0, MAX_LABEL)
          : KIND_LABEL[kind];
      nodes.push({
        id,
        kind,
        label,
        x: clampInt(candidate.x, 0, GRID_COLS - 1),
        y: clampInt(candidate.y, 0, GRID_ROWS - 1),
        fixed: candidate.fixed === true,
        fixedParams: candidate.fixedParams === true ? true : undefined,
        params: sanitizeParamMap(kind, candidate.params),
      });
    }
  }
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: IsLink[] = [];
  const linkSeen = new Set<string>();
  const drivenPorts = new Set<string>();
  if (Array.isArray(source.links)) {
    for (const raw of source.links) {
      if (typeof raw !== "object" || raw === null) continue;
      const candidate = raw as Record<string, unknown>;
      const from = typeof candidate.from === "string" ? candidate.from : "";
      const to = typeof candidate.to === "string" ? candidate.to : "";
      const port = typeof candidate.port === "string" ? candidate.port : "";
      if (!ids.has(from) || !ids.has(to) || from === to) continue;
      const target = byId.get(to)!;
      const sourceNode = byId.get(from)!;
      if (!NODE_PORTS[target.kind].in.includes(port)) continue;
      if (NODE_PORTS[sourceNode.kind].out.length === 0) continue;
      const key = `${from}|${to}|${port}`;
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      const portKey = `${to}|${port}`;
      if (drivenPorts.has(portKey)) {
        const idx = links.findIndex((l) => l.to === to && l.port === port);
        if (idx >= 0) links.splice(idx, 1);
      }
      drivenPorts.add(portKey);
      links.push({ from, to, port });
    }
  }
  return { nodes, links };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Re-apply stage-frozen params: a node matching a `fixedParams` prefill
 * entry keeps the prefill's params no matter what the wire draft claims.
 * The reducer refuses param edits on these nodes, but a crafted request
 * can retune a calibrated device — judges re-assert prefill before
 * running cases.
 */
export function enforcePrefillParams(topology: IsTopology, prefill: IsTopology): IsTopology {
  const frozen = new Map(prefill.nodes.filter((n) => n.fixedParams).map((n) => [n.id, n]));
  if (frozen.size === 0) return topology;
  return {
    ...topology,
    nodes: topology.nodes.map((node) => {
      const prefillNode = frozen.get(node.id);
      if (!prefillNode) return node;
      return { ...node, fixedParams: true, params: { ...prefillNode.params } };
    }),
  };
}

export function nodeById(topology: IsTopology, id: string): IsNode | null {
  return topology.nodes.find((n) => n.id === id) ?? null;
}

/** The single driver of an in-port, or null when unwired. */
export function driverOf(topology: IsTopology, nodeId: string, port: string): IsLink | null {
  return topology.links.find((l) => l.to === nodeId && l.port === port) ?? null;
}

export function firstFreeSlot(topology: IsTopology): { x: number; y: number } {
  const used = new Set(topology.nodes.map((n) => `${n.x}|${n.y}`));
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (!used.has(`${x}|${y}`)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
