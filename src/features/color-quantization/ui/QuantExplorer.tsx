/**
 * Quantization explorer: the toner rack (pick stages) or the mapping table
 * (free stage), a gallery member strip, the source → printed preview pair,
 * and the live collision report — all evaluated against the public gallery
 * with the same rules the server uses.
 *
 * When the student's stage-1 `nearest_toner` source exists, a preview-rule
 * toggle (pick stages) runs it over every source color against the loaded
 * cartridges to derive the effective mapping table — so the rule they
 * wrote literally produces the print the receiver sees. Collisions name
 * the merged feature: which part's colors folded into one toner.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import { Icon } from "../../../shared/ui/Icon";
import { publicGalleryFor } from "../domain/fixtures.ts";
import {
  PAPER,
  SOURCE_COLORS,
  TONER_RACK,
  rgbCss,
  sourceCellCss,
  tonerCellCss,
} from "../domain/palette.ts";
import { countOverrides, nnTable, quantizeImage, usedToners } from "../domain/quantize.ts";
import { confusionPairs, judgeMapping } from "../domain/recognize.ts";
import { mergedParts, PART_LABELS, type MergedPart } from "../domain/sprites.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import type { StageDraft } from "../lesson/state.ts";
import { PaletteCanvas } from "./PaletteCanvas.tsx";
import { runNearestToner } from "./pyodideRunner.ts";

function tonerName(index: number): string {
  return index < 0 ? "纸白" : TONER_RACK[index].name;
}

function tonerCss(index: number): string {
  return rgbCss(index < 0 ? PAPER : TONER_RACK[index].rgb);
}

/** "耳：violet 和 wine 都印成 magenta" — one merged feature, human-readable. */
function mergedPartText(m: MergedPart): string {
  const a = SOURCE_COLORS[m.aIndex - 1]?.name ?? `#${m.aIndex}`;
  const b = SOURCE_COLORS[m.bIndex - 1]?.name ?? `#${m.bIndex}`;
  return `${PART_LABELS[m.part]}：${a}(${m.aIndex}号) 和 ${b}(${m.bIndex}号) 都印成了 ${tonerName(m.target)}`;
}

/** Numbered swatch button for one rack toner. */
function TonerSwatch(props: {
  index: number;
  active: boolean;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  const toner = () => TONER_RACK[props.index];
  return (
    <Button
      aria-label={`${props.index + 1}号粉 ${toner().name}`}
      aria-pressed={props.active ? "true" : "false"}
      class={`quant-toner${props.active ? " is-active" : ""}`}
      disabled={props.disabled}
      onClick={() => props.onToggle(props.index)}
      type="button"
    >
      <span class="quant-swatch" style={{ background: rgbCss(toner().rgb) }}>
        {props.index + 1}
      </span>
      <span class="quant-toner-name">{toner().name}</span>
    </Button>
  );
}

export function QuantExplorer(props: {
  stage: QuantStageDef;
  draft: StageDraft;
  onToners: (toners: number[]) => void;
  onTable: (table: number[]) => void;
  /** Student's stage-1 nearest_toner source; enables the "用我的规则" preview. */
  ruleCode?: string;
  /** When provided, renders a share-link button (staff only). */
  shareSearch?: Record<string, string | number>;
}) {
  const gallery = createMemo(() => publicGalleryFor(props.stage.category));
  const [memberIndex, setMemberIndex] = createSignal(0);
  const member = createMemo(() => {
    const list = gallery();
    return list[Math.min(memberIndex(), list.length - 1)];
  });
  const [inspectedPairId, setInspectedPairId] = createSignal<string | null>(null);
  const [useMyRule, setUseMyRule] = createSignal(false);
  const [myTable, setMyTable] = createSignal<number[] | null>(null);
  const [myError, setMyError] = createSignal<string | null>(null);
  const [myRunning, setMyRunning] = createSignal(false);
  let runSeq = 0;

  const defaultTable = createMemo(() =>
    props.stage.fixedLoadout ? nnTable(props.stage.fixedLoadout) : null,
  );

  /** The mapping the printer would apply under the current draft. */
  const builtinTable = createMemo(() => {
    if (props.stage.mode === "pick") return nnTable(props.draft.toners);
    return props.draft.table ?? defaultTable() ?? [];
  });

  // Pick stages: run the student's nearest_toner over the source palette
  // against the loaded cartridges to derive the mapping table they wrote.
  createEffect(
    () => ({
      mode: props.stage.mode,
      enabled: useMyRule(),
      ruleCode: props.ruleCode,
      toners: props.draft.toners,
    }),
    ({ mode, enabled, ruleCode, toners }) => {
      if (mode !== "pick" || !enabled || !ruleCode?.trim()) {
        setMyTable(null);
        setMyError(null);
        setMyRunning(false);
        return;
      }
      const candidates = [PAPER, ...toners.map((i) => TONER_RACK[i].rgb)];
      const seq = (runSeq += 1);
      setMyRunning(true);
      const timer = setTimeout(() => {
        void runNearestToner(
          ruleCode,
          SOURCE_COLORS.map((c) => [...c.rgb]),
          candidates.map((c) => [...c]),
        )
          .then((results) => {
            if (runSeq !== seq) return;
            const table: number[] = [];
            const bad: string[] = [];
            results.forEach((raw, i) => {
              const v = Number(raw);
              if (Number.isInteger(v) && v >= 0 && v < candidates.length) {
                table[i] = v === 0 ? -1 : toners[v - 1];
              } else {
                table[i] = -1;
                if (bad.length < 3) {
                  bad.push(
                    `${i + 1}号 ${SOURCE_COLORS[i].name} 返回了 ${raw === null ? "None" : JSON.stringify(raw)}`,
                  );
                }
              }
            });
            setMyTable(table);
            setMyError(
              bad.length
                ? `nearest_toner 必须返回候选编号（0=纸白, 1..${candidates.length - 1}=已装的粉）——${bad.join("；")}，已按纸白处理。`
                : null,
            );
          })
          .catch((err: unknown) => {
            if (runSeq !== seq) return;
            setMyTable(null);
            setMyError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            if (runSeq === seq) setMyRunning(false);
          });
      }, 250);
      return () => clearTimeout(timer);
    },
  );

  const effectiveTable = createMemo(() =>
    props.stage.mode === "pick" && useMyRule() && myTable() ? myTable()! : builtinTable(),
  );

  const report = createMemo(() => {
    const table = effectiveTable();
    return table.length ? judgeMapping(gallery(), table) : null;
  });
  const pairs = createMemo(() => {
    const table = effectiveTable();
    return table.length ? confusionPairs(gallery(), table) : [];
  });

  const printed = createMemo(() => {
    const table = effectiveTable();
    return table.length ? quantizeImage(member().image, table) : member().image;
  });

  const tonersUsed = createMemo(() => usedToners(effectiveTable()));
  const overrides = createMemo(() => {
    const def = defaultTable();
    return props.stage.mode === "free" && props.draft.table && def
      ? countOverrides(props.draft.table, def)
      : null;
  });

  /** Members whose prints collide, for marking the strip. */
  const collidedIds = createMemo(() => {
    const set = new Set<string>();
    const r = report();
    if (r) {
      for (const v of r.verdicts) {
        if (!v.ok) set.add(v.queryId);
      }
    }
    return set;
  });

  /** A clicked collision pair: member A shown, merged parts listed. */
  const inspectedPair = createMemo(() => {
    const pairId = inspectedPairId();
    const table = effectiveTable();
    if (!pairId || !table.length) return null;
    const pair = pairs().find((p) => `${p.aId}-${p.bId}` === pairId);
    if (!pair) return null;
    const list = gallery();
    const a = list.find((e) => e.id === pair.aId);
    const b = list.find((e) => e.id === pair.bId);
    if (!a || !b) return null;
    return { pair, merged: mergedParts(a.parts, b.parts, table) };
  });

  const toggleToner = (index: number) => {
    const next = props.draft.toners.includes(index)
      ? props.draft.toners.filter((i) => i !== index)
      : [...props.draft.toners, index];
    props.onToners(next);
  };

  /** Cycle one table entry through the allowed targets (free mode). */
  const cycleTarget = (srcIndex: number) => {
    const def = defaultTable();
    if (props.stage.mode !== "free" || !def) return;
    const allowed = [...(props.stage.fixedLoadout ?? []), -1];
    const table = props.draft.table ?? def;
    const cur = allowed.indexOf(table[srcIndex]);
    const next = allowed[(cur + 1 + allowed.length) % allowed.length];
    const nextTable = table.slice();
    nextTable[srcIndex] = next;
    props.onTable(nextTable);
  };

  const inspectPair = (pairKey: string, aId: string) => {
    const index = gallery().findIndex((e) => e.id === aId);
    if (index >= 0) setMemberIndex(index);
    setInspectedPairId(pairKey);
  };

  const overSlots = () =>
    props.stage.mode === "pick" && tonersUsed().length > (props.stage.tonerSlots ?? 0);
  const overOverrides = () =>
    props.stage.mode === "free" &&
    overrides() !== null &&
    overrides()! > (props.stage.overrideBudget ?? 0);

  return (
    <section aria-labelledby="quant-explorer-title" class="quant-explorer">
      <h3 id="quant-explorer-title">
        印刷实验台（公开图谱 {gallery().length} 张 ·{" "}
        {props.stage.category === "cadet" ? "学员" : ""}
        {props.stage.category === "patrol" ? "巡逻" : ""}
        {props.stage.category === "cargo" ? "货运" : ""}
        {props.stage.category === "recon" ? "侦察" : ""}机器人）
      </h3>
      <Show when={props.shareSearch}>{(search) => <ScenarioLinkButton search={search()} />}</Show>

      <Show
        fallback={
          <div class="quant-rack-block">
            <p class="quant-slot-note">
              本关粉盒固定：
              {(props.stage.fixedLoadout ?? [])
                .map((i) => `${i + 1}号 ${TONER_RACK[i].name}`)
                .join("、")}
              ，外加免费的纸白。映射表最多可改 {props.stage.overrideBudget} 条默认值
              {overrides() !== null
                ? `（当前 ${overrides()} 条${overOverrides() ? "，超支" : ""}）`
                : ""}
              。
            </p>
          </div>
        }
        when={props.stage.mode === "pick"}
      >
        <div class="quant-rack-block">
          <div aria-label="墨粉架：点击装入或取下" class="quant-rack" role="group">
            <For each={TONER_RACK}>
              {(_t, index) => (
                <TonerSwatch
                  active={props.draft.toners.includes(index())}
                  disabled={false}
                  index={index()}
                  onToggle={toggleToner}
                />
              )}
            </For>
          </div>
          <p class={`quant-slot-note${overSlots() ? " is-over" : ""}`}>
            <Show when={overSlots()}>
              <Icon name="warning" size={13} />
            </Show>
            已装 {props.draft.toners.length} / {props.stage.tonerSlots} 槽
            {overSlots()
              ? `——打印机只有 ${props.stage.tonerSlots} 个槽，超出的 ${props.draft.toners.length - props.stage.tonerSlots!} 种装不进去，这样提交必定失败`
              : " · 纸白永远免费"}
          </p>
          <Show when={props.stage.probes.length > 0}>
            <div class="quant-probes">
              <span>试试常见装法：</span>
              <For each={props.stage.probes}>
                {(probe) => (
                  <Button
                    class="quant-probe"
                    onClick={() => props.onToners(probe.toners)}
                    type="button"
                  >
                    {probe.label}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <Show when={props.ruleCode?.trim()}>
            <div aria-label="印刷使用的映射规则" class="quant-rule-toggle" role="group">
              <span>映射规则：</span>
              <Button
                aria-pressed={!useMyRule() ? "true" : "false"}
                class={!useMyRule() ? "is-active" : ""}
                onClick={() => setUseMyRule(false)}
                type="button"
              >
                内置最近色
              </Button>
              <Button
                aria-pressed={useMyRule() ? "true" : "false"}
                class={useMyRule() ? "is-active" : ""}
                onClick={() => setUseMyRule(true)}
                type="button"
              >
                我写的 nearest_toner
              </Button>
              <Show when={myRunning()}>
                <span class="quant-rule-running">运行中…</span>
              </Show>
            </div>
          </Show>
          <Show when={useMyRule() && myError()}>
            {(err) => (
              <p class="quant-rule-error" role="alert">
                {err()}
                {myTable() ? "" : "（预览暂用内置规则）"}
              </p>
            )}
          </Show>
        </div>
      </Show>

      <div class="quant-columns">
        <div class="quant-left">
          <div aria-label="选择要印的原稿" class="quant-member-strip" role="listbox">
            <For each={gallery()}>
              {(entry, index) => (
                <button
                  aria-label={`查看 ${entry.label}`}
                  aria-selected={index() === memberIndex() ? "true" : "false"}
                  class={`quant-member${index() === memberIndex() ? " is-active" : ""}${
                    collidedIds().has(entry.id) ? " is-collided" : ""
                  }`}
                  onClick={() => {
                    setMemberIndex(index());
                    setInspectedPairId(null);
                  }}
                  role="option"
                  type="button"
                >
                  <PaletteCanvas
                    ariaLabel={entry.label}
                    colorOf={sourceCellCss}
                    image={entry.image}
                    pixelSize={2}
                  />
                  <span>{entry.label}</span>
                </button>
              )}
            </For>
          </div>

          <Show when={report()}>
            {(r) => (
              <p class={`quant-verdict-line${r().identified === r().total ? " is-ok" : ""}`}>
                当前{props.stage.mode === "pick" ? "装法" : "映射"}下，接收端还能认出{" "}
                <strong>
                  {r().identified} / {r().total}
                </strong>{" "}
                张
                <Show when={r().identified === r().total}>
                  <Icon name="check" size={13} />
                </Show>
              </p>
            )}
          </Show>

          <Show
            fallback={
              <Show when={effectiveTable().length > 0}>
                <p class="quant-clear">当前映射下，图谱里每一张接收端都能认出。</p>
              </Show>
            }
            when={pairs().length > 0}
          >
            <div class="quant-collisions" role="note">
              <strong>接收端会分不清这 {pairs().length} 对：</strong>
              <ul>
                <For each={pairs().slice(0, 5)}>
                  {(pair) => {
                    const key = `${pair.aId}-${pair.bId}`;
                    return (
                      <li>
                        <Button
                          class={`quant-pair-link${inspectedPairId() === key ? " is-active" : ""}`}
                          onClick={() => inspectPair(key, pair.aId)}
                          type="button"
                        >
                          {pair.aLabel} ≡ {pair.bLabel}
                        </Button>
                      </li>
                    );
                  }}
                </For>
                <Show when={pairs().length > 5}>
                  <li>…还有 {pairs().length - 5} 对</li>
                </Show>
              </ul>
              <Show
                fallback={<p class="quant-merged-note">点一对，看是哪个部件的颜色被合并了。</p>}
                when={inspectedPair()}
              >
                {(inspected) => (
                  <Show
                    fallback={<p class="quant-merged-note">两台机器人原稿完全相同。</p>}
                    when={inspected().merged.length > 0}
                  >
                    <ul class="quant-merged-list">
                      <For each={inspected().merged}>{(m) => <li>{mergedPartText(m)}</li>}</For>
                    </ul>
                  </Show>
                )}
              </Show>
            </div>
          </Show>
        </div>

        <div class="quant-right">
          <div class="quant-preview-pair">
            <figure>
              <PaletteCanvas
                ariaLabel={`原图 ${member().label}`}
                colorOf={sourceCellCss}
                image={member().image}
              />
              <figcaption>发送原稿 {member().label}</figcaption>
            </figure>
            <span aria-hidden="true" class="quant-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <figure>
              <PaletteCanvas
                ariaLabel={`${member().label} 印出结果`}
                colorOf={tonerCellCss}
                image={printed()}
              />
              <figcaption>
                接收端所见{useMyRule() && props.stage.mode === "pick" ? "（你的规则）" : ""}
              </figcaption>
            </figure>
          </div>

          <Show when={props.stage.mode === "free" ? defaultTable() : null}>
            {(defTable) => (
              <table class="quant-map-table">
                <caption>映射表（点目标可循环切换；✎ = 和默认不同）</caption>
                <thead>
                  <tr>
                    <th>源色</th>
                    <th>印为</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={SOURCE_COLORS}>
                    {(color, i) => {
                      const target = () => (props.draft.table ?? defTable())[i()];
                      const overridden = () =>
                        props.draft.table !== null && target() !== defTable()[i()];
                      return (
                        <tr class={overridden() ? "is-overridden" : ""}>
                          <td>
                            <span
                              class="quant-swatch is-source"
                              style={{ background: rgbCss(color.rgb) }}
                            >
                              {i() + 1}
                            </span>
                            {i() + 1}号 {color.name}
                          </td>
                          <td>
                            <Button
                              aria-label={`${color.name} 的打印目标`}
                              class="quant-map-target"
                              onClick={() => cycleTarget(i())}
                              type="button"
                            >
                              <span class="quant-swatch" style={{ background: tonerCss(target()) }}>
                                {target() < 0 ? "纸" : target() + 1}
                              </span>
                              {tonerName(target())}
                              {overridden() ? " ✎" : ""}
                            </Button>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
