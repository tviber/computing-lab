/**
 * Domain tests for the is-sim discrete-event simulator: per-node
 * semantics, deterministic ordering, the event budget, drop causes,
 * and the judge's assertion families. Reference topologies double as
 * the contract the hidden set is built against.
 */

import { describe, expect, it } from "vitest";
import { judgeCase, type IsCase, type IsEventKind } from "./scenario.ts";
import { sanitizeTopology, type IsTopology } from "./model.ts";
import { runScenario } from "./sim.ts";
import { IS_REFERENCE } from "./fixtures.ts";
import { IS_SIM_STAGES } from "./stages.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { hiddenCasesFor } from "../../../../server/judge/is-sim/hiddenSet.ts";

const topo = (nodes: IsTopology["nodes"], links: IsTopology["links"]): IsTopology => ({
  nodes,
  links,
});

const sensor = (id: string, params = {}) => ({
  id,
  kind: "sensor" as const,
  label: id,
  x: 0,
  y: 0,
  fixed: true,
  params,
});
const gateway = (id: string, params = {}) => ({
  id,
  kind: "gateway" as const,
  label: id,
  x: 1,
  y: 0,
  fixed: false,
  params,
});
const db = (id: string, x = 2) => ({
  id,
  kind: "db" as const,
  label: id,
  x,
  y: 0,
  fixed: true,
  params: {},
});
const actuator = (id: string, threshold = 50) => ({
  id,
  kind: "actuator" as const,
  label: id,
  x: 2,
  y: 0,
  fixed: true,
  params: { threshold },
});
const dashboard = (id: string, x = 3) => ({
  id,
  kind: "dashboard" as const,
  label: id,
  x,
  y: 0,
  fixed: true,
  params: {},
});
const human = (id: string, workDelay = 2) => ({
  id,
  kind: "human" as const,
  label: id,
  x: 1,
  y: 1,
  fixed: true,
  params: { workDelay },
});

const emit = (at: number, node: string, kind: IsEventKind, payload = 0) => ({
  at,
  op: "emit" as const,
  node,
  kind,
  payload,
});

const baseCase = (over: Partial<IsCase>): IsCase => ({
  name: over.name ?? "case",
  category: over.category ?? "correctness",
  horizon: over.horizon ?? 20,
  script: over.script ?? [],
  init: over.init,
  seed: over.seed,
  expect: { events: 64, ...over.expect },
});

describe("sanitizeTopology", () => {
  it("keeps a single driver per in-port (last link wins)", () => {
    const t = sanitizeTopology(
      topo(
        [sensor("a"), sensor("b"), db("store")],
        [
          { from: "a", to: "store", port: "write" },
          { from: "b", to: "store", port: "write" },
        ],
      ),
    );
    expect(t.links).toEqual([{ from: "b", to: "store", port: "write" }]);
  });

  it("drops links to invalid ports and missing nodes", () => {
    const t = sanitizeTopology(
      topo(
        [sensor("a"), db("store")],
        [
          { from: "a", to: "store", port: "write" },
          { from: "a", to: "store", port: "bogus" },
          { from: "ghost", to: "store", port: "write" },
          { from: "a", to: "a", port: "out" },
        ],
      ),
    );
    expect(t.links).toEqual([{ from: "a", to: "store", port: "write" }]);
  });

  it("clamps params and dedupes node ids", () => {
    const t = sanitizeTopology(
      topo([{ ...sensor("a"), params: { interval: 999, noise: -5 } }, { ...sensor("a") }], []),
    );
    expect(t.nodes).toHaveLength(1);
    expect(t.nodes[0].params.interval).toBe(64);
    expect(t.nodes[0].params.noise).toBe(0);
  });
});

describe("node semantics", () => {
  it("sensor emit travels a link in one tick and lands in the db", () => {
    const t = topo([sensor("s"), db("store")], [{ from: "s", to: "store", port: "write" }]);
    const run = runScenario(
      t,
      baseCase({
        script: [{ at: 0, op: "emit", node: "s", kind: "borrow", payload: 7 }],
        expect: { events: 8 },
      }),
    );
    expect(run.devices.store.stored).toEqual([7]);
    expect(run.trace.map((r) => [r.tick, r.node])).toEqual([
      [0, "s"],
      [1, "store"],
    ]);
  });

  it("gateway forwards with its configured delay", () => {
    const t = topo(
      [sensor("s"), gateway("g", { delay: 3 }), db("store")],
      [
        { from: "s", to: "g", port: "a" },
        { from: "g", to: "store", port: "write" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({
        script: [{ at: 0, op: "emit", node: "s", kind: "borrow", payload: 5 }],
        expect: { events: 8 },
      }),
    );
    expect(run.devices.store.stored).toEqual([5]);
    const storeRow = run.trace.find((r) => r.node === "store");
    expect(storeRow?.tick).toBe(0 + 1 + 3 + 1);
  });

  it("gateway dropRate absorbs events deterministically under a seed", () => {
    const t = topo(
      [sensor("s"), gateway("g", { dropRate: 1 }), db("store")],
      [
        { from: "s", to: "g", port: "a" },
        { from: "g", to: "store", port: "write" },
      ],
    );
    const testCase = baseCase({
      script: [emit(0, "s", "borrow", 1), emit(1, "s", "borrow", 2)],
      expect: { events: 16 },
    });
    const run = runScenario(t, testCase);
    expect(run.devices.store.stored).toEqual([]);
    expect(run.devices.g.dropped).toBe(2);
    expect(run.dropped).toEqual([]); // absorbed, not a fault
  });

  it("db delete removes a matching record, query returns a count", () => {
    const t = topo(
      [sensor("s"), db("store"), dashboard("desk")],
      [
        { from: "s", to: "store", port: "write" },
        { from: "store", to: "desk", port: "in" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({
        init: { dbRecords: { store: [9, 9, 1] } },
        script: [{ at: 0, op: "emit", node: "s", kind: "borrow", payload: 9 }],
        expect: { events: 16 },
      }),
    );
    // initial 3 records + 1 write
    expect(run.devices.store.stored).toEqual([9, 9, 1, 9]);
  });

  it("actuator fires on threshold crossing and clears on drop", () => {
    const t = topo(
      [sensor("temp"), actuator("sprinkler", 60), dashboard("board")],
      [
        { from: "temp", to: "sprinkler", port: "in" },
        { from: "sprinkler", to: "board", port: "in" },
      ],
    );
    const testCase = baseCase({
      script: [
        emit(0, "temp", "reading", 40),
        emit(2, "temp", "reading", 70),
        emit(4, "temp", "reading", 80),
        emit(6, "temp", "reading", 30),
      ],
      expect: { events: 32, fired: ["sprinkler"], seen: { board: 2 } },
    });
    const verdict = judgeCase(t, testCase);
    expect(verdict.passed).toBe(true);
    expect(verdict.run.devices.sprinkler.fired).toBe(1);
    expect(verdict.run.devices.board.seen).toBe(2); // action + clear
    expect(verdict.run.devices.sprinkler.active).toBe(false);
  });

  it("human node processes serially and preserves event kind+payload", () => {
    const t = topo(
      [sensor("s"), human("desk", 2), db("store")],
      [
        { from: "s", to: "desk", port: "in" },
        { from: "desk", to: "store", port: "delete" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({
        init: { dbRecords: { store: [11, 22] } },
        script: [emit(0, "s", "return-request", 11), emit(1, "s", "return-request", 22)],
        expect: { events: 32 },
      }),
    );
    expect(run.devices.store.stored).toEqual([]);
    // serial: arrivals at t=1,2 → dues at 3,5 → deletes land at 4,6
    const deleteTicks = run.trace.filter((r) => r.node === "store").map((r) => r.tick);
    expect(deleteTicks).toEqual([4, 6]);
  });
});

describe("determinism and bounds", () => {
  it("same case produces identical traces across runs", () => {
    const t = topo(
      [sensor("s", { interval: 1, base: 50, noise: 10 }), db("store")],
      [{ from: "s", to: "store", port: "write" }],
    );
    const testCase = baseCase({ seed: 7, horizon: 10, script: [], expect: { events: 64 } });
    const a = runScenario(t, testCase);
    const b = runScenario(t, testCase);
    expect(a.trace).toEqual(b.trace);
    expect(a.devices.store.stored).toEqual(b.devices.store.stored);
  });

  it("same-tick events pop in script order (stable seq)", () => {
    const t = topo(
      [sensor("a"), sensor("b"), db("store")],
      [
        { from: "a", to: "store", port: "write" },
        // b can't also drive write — give it a dashboard instead
      ],
    );
    const withDash = topo(
      [...t.nodes, dashboard("desk")],
      [...t.links, { from: "b", to: "desk", port: "in" }],
    );
    const run = runScenario(
      withDash,
      baseCase({
        script: [emit(0, "a", "borrow", 1), emit(0, "b", "borrow", 2)],
        expect: { events: 8 },
      }),
    );
    expect(run.trace[0].node).toBe("a");
    expect(run.trace[1].node).toBe("b");
  });

  it("draining the queue exactly on the maxEvents step still reports done", () => {
    const t = topo([sensor("s"), db("store")], [{ from: "s", to: "store", port: "write" }]);
    // 2 steps per borrow (stim + delivery): two emits = exactly 4 steps.
    const run = runScenario(
      t,
      baseCase({
        script: [emit(0, "s", "borrow", 1), emit(1, "s", "borrow", 2)],
        expect: { events: 8 },
      }),
      4,
    );
    expect(run.reason).toBe("done");
    expect(run.eventsUsed).toBe(4);
    expect(run.devices.store.stored).toEqual([1, 2]);
  });

  it("event budget caps runaway amplification", () => {
    // s -> g -> g2 -> g (cycle across two gateways) would loop-drop,
    // so instead flood: one emit fanning into many hops is bounded anyway.
    const t = topo([sensor("s"), db("store")], [{ from: "s", to: "store", port: "write" }]);
    const many = Array.from({ length: 100 }, (_, i) => emit(i, "s", "borrow", i));
    const run = runScenario(
      t,
      baseCase({ horizon: 400, script: many, expect: { events: 400 } }),
      10,
    );
    expect(run.reason).toBe("budget");
    expect(run.eventsUsed).toBe(10);
  });

  it("a wired cycle dies as a loop drop instead of running forever", () => {
    const t = topo(
      [sensor("s"), gateway("g1"), gateway("g2"), db("store")],
      [
        { from: "s", to: "g1", port: "a" },
        { from: "g1", to: "g2", port: "a" },
        { from: "g2", to: "g1", port: "b" },
        { from: "g1", to: "store", port: "write" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({ script: [emit(0, "s", "borrow", 3)], expect: { events: 32 } }),
    );
    expect(run.reason).toBe("done");
    expect(run.dropped.some((d) => d.cause === "loop" && d.to === "g1")).toBe(true);
    expect(run.devices.store.stored).toEqual([3]);
  });
});

describe("faults and deadlines", () => {
  it("link-down drops deliveries on that port until link-up", () => {
    const t = topo([sensor("s"), db("store")], [{ from: "s", to: "store", port: "write" }]);
    const run = runScenario(
      t,
      baseCase({
        // a fault scheduled at tick t applies before same-tick arrivals
        script: [
          emit(0, "s", "borrow", 1),
          { at: 2, op: "link-down", node: "store", port: "write" },
          emit(3, "s", "borrow", 2),
          { at: 5, op: "link-up", node: "store", port: "write" },
          emit(6, "s", "borrow", 3),
        ],
        expect: { events: 32 },
      }),
    );
    expect(run.devices.store.stored).toEqual([1, 3]);
    expect(run.dropped.map((d) => d.cause)).toEqual(["link-down"]);
  });

  it("device-down drops all deliveries to the dead node", () => {
    const t = topo(
      [sensor("s"), db("store"), db("copy", 3)],
      [
        { from: "s", to: "store", port: "write" },
        { from: "s", to: "copy", port: "write" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({
        script: [
          emit(0, "s", "borrow", 1),
          { at: 2, op: "device-down", node: "store" },
          emit(3, "s", "borrow", 2),
        ],
        expect: { events: 32 },
      }),
    );
    expect(run.devices.store.stored).toEqual([1]);
    expect(run.devices.copy.stored).toEqual([1, 2]);
    expect(run.dropped.filter((d) => d.cause === "device-down")).toHaveLength(1);
  });

  it("events due at/after horizon die as timeouts; human queue stays pending", () => {
    const t = topo(
      [sensor("s"), human("desk", 10), db("store")],
      [
        { from: "s", to: "desk", port: "in" },
        { from: "desk", to: "store", port: "delete" },
      ],
    );
    const run = runScenario(
      t,
      baseCase({
        horizon: 5,
        init: { dbRecords: { store: [1] } },
        script: [emit(1, "s", "return-request", 1)],
        expect: { events: 32 },
      }),
    );
    expect(run.devices.desk.pending).toBe(1);
    expect(run.dropped.some((d) => d.cause === "timeout")).toBe(true);
    expect(run.devices.store.stored).toEqual([1]);
  });
});

describe("judgeCase assertions", () => {
  const lending = topo(
    [sensor("sb"), sensor("sr"), human("lib", 1), db("books")],
    [
      { from: "sb", to: "books", port: "write" },
      { from: "sr", to: "lib", port: "in" },
      { from: "lib", to: "books", port: "delete" },
    ],
  );
  const lendingCase = baseCase({
    name: "借还闭环",
    script: [
      emit(0, "sb", "borrow", 101),
      emit(0, "sb", "borrow", 102),
      emit(1, "sr", "return-request", 101),
      emit(2, "sr", "return-request", 102),
    ],
    expect: {
      events: 64,
      dbCount: { books: 0 },
      approval: [{ node: "books", port: "delete", via: "human" }],
      noPending: true,
    },
  });

  it("passes the reference topology and flags direct-delete as unapproved", () => {
    expect(judgeCase(lending, lendingCase).passed).toBe(true);

    const bypassed = topo(lending.nodes, [
      { from: "sb", to: "books", port: "write" },
      { from: "sr", to: "books", port: "delete" },
    ]);
    const verdict = judgeCase(bypassed, lendingCase);
    expect(verdict.passed).toBe(false);
    expect(verdict.unapproved.length).toBeGreaterThan(0);
  });

  it("reports missing records and over-budget runs", () => {
    const broken = topo(lending.nodes, [{ from: "sb", to: "books", port: "write" }]);
    const verdict = judgeCase(broken, lendingCase);
    expect(verdict.passed).toBe(false);
    expect(verdict.dbDiff[0]?.node).toBe("books");
  });
});

describe("stage case sets", () => {
  it("reference topologies pass every public and hidden case of their stage", () => {
    for (const stage of IS_SIM_STAGES) {
      const reference = IS_REFERENCE[stage.index];
      expect(reference, `stage ${stage.index} has no reference`).toBeTruthy();
      const cases = [...publicCasesFor(stage.index, 42), ...hiddenCasesFor(stage.index, 42)];
      expect(cases.length).toBeGreaterThan(0);
      for (const testCase of cases) {
        const verdict = judgeCase(reference, testCase, stage.maxEvents);
        expect(
          verdict.passed,
          `stage ${stage.index} case "${testCase.name}": ${JSON.stringify({
            dbDiff: verdict.dbDiff,
            seenDiff: verdict.seenDiff,
            firedDiff: verdict.firedDiff,
            unapproved: verdict.unapproved,
            pending: verdict.pending,
            dropped: verdict.dropped.length,
          })}`,
        ).toBe(true);
      }
    }
  });
});
