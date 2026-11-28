import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { DISHES } from "../domain/contracts";
import {
  advanceRush,
  autoRushStep,
  createRushState,
  RUSH_DURATION,
  rushPatience,
  type RushAction,
  type RushTicket,
} from "../domain/rushGame";
import { RushDiorama } from "./RushDiorama";
import "./rushGame.css";

export function RushGame() {
  const [state, setState] = createSignal(createRushState());
  const [playing, setPlaying] = createSignal(false);
  const [started, setStarted] = createSignal(false);
  const [automatic, setAutomatic] = createSignal(false);
  const [manualScore, setManualScore] = createSignal<number | null>(null);
  const [note, setNote] = createSignal("先接单，再下锅，最后送餐。加急顾客只有 6 秒耐心！");
  const ended = () => state().tick >= RUSH_DURATION;
  const served = () => state().tickets.filter((t) => t.onTime).length;
  const lost = () => state().tickets.filter((t) => t.status === "lost").length;
  const active = createMemo(() =>
    state().tickets.filter(
      (t) => t.arrival <= state().tick && t.status !== "lost" && t.status !== "served",
    ),
  );
  const stageTickets = (statuses: RushTicket["status"][]) =>
    active().filter((t) => statuses.includes(t.status));
  const start = (auto: boolean) => {
    if (auto && started() && !automatic()) setManualScore(served());
    setState(createRushState());
    setStarted(true);
    setAutomatic(auto);
    setPlaying(true);
    setNote(
      auto
        ? "自动排单机按离超时还剩多久挑单。看同一波顾客能救回多少。"
        : "开门营业！点菜名接单 → 点小票下锅 → 点成品送餐。",
    );
  };
  createEffect(
    () => playing(),
    (running) => {
      if (!running) return;
      const timer = window.setInterval(() => {
        const current = state();
        if (current.tick >= RUSH_DURATION) {
          setPlaying(false);
          return;
        }
        const next = automatic() ? autoRushStep(current) : advanceRush(current, { type: "step" });
        setState(next);
        if (next.tick >= RUSH_DURATION) setPlaying(false);
      }, 100);
      return () => window.clearInterval(timer);
    },
  );
  const act = (action: RushAction) => {
    if (!playing() || automatic()) return;
    const before = state();
    const after = advanceRush(before, action);
    setState(after);
    if (after.mistakes > before.mistakes) setNote("这位顾客：我点的不是这个！再看一眼点单气泡。");
    else if (after === before) setNote("工位还忙着，先处理另一站！");
    else
      setNote(
        action.type === "intake"
          ? "小票记好了！厨房点一下就能开火。"
          : action.type === "cook"
            ? "滋啦——开火！别忘了去出餐台送餐。"
            : "端稳了，送餐员出发！",
      );
  };
  const face = (t: RushTicket) =>
    rushPatience(t, state().tick) > 0.5 ? "🙂" : rushPatience(t, state().tick) > 0.2 ? "😬" : "🤯";
  const card = (t: RushTicket) => (
    <div class={`rush-ticket${rushPatience(t, state().tick) < 0.2 ? " is-critical" : ""}`}>
      <div class="rush-ticket-head">
        <strong>
          {face(t)} {t.id} 号客
        </strong>
        <span>{t.urgent ? "⚡ 加急" : "普通"}</span>
      </div>
      <p>{t.status === "incoming" ? `「来份${t.dish}！」` : t.dish}</p>
      <meter
        aria-label={`${t.id} 号客剩余耐心`}
        min={0}
        max={1}
        value={rushPatience(t, state().tick)}
      />
      <Show when={t.status === "incoming"}>
        <div class="rush-dishes">
          <For each={DISHES}>
            {(dish) => (
              <Button
                disabled={!playing() || automatic()}
                onClick={() => act({ type: "intake", id: t.id, dish })}
                type="button"
              >
                {dish}
              </Button>
            )}
          </For>
        </div>
      </Show>
      <Show when={t.status === "queued" || t.status === "ready"}>
        <Button
          class="button button-secondary"
          disabled={
            !playing() ||
            automatic() ||
            active().some(
              (other) => other.status === (t.status === "queued" ? "cooking" : "delivering"),
            )
          }
          onClick={() => act({ type: t.status === "queued" ? "cook" : "serve", id: t.id })}
          type="button"
        >
          {t.status === "queued" ? "🔥 下锅" : "🥡 送餐"}
        </Button>
      </Show>
      <Show when={t.status === "cooking" || t.status === "delivering"}>
        <small>
          {t.status === "cooking" ? "🍳 制作中" : "🏃 正在送餐"} ·{" "}
          {Math.max(0, ((t.finish ?? 0) - state().tick) / 10).toFixed(1)} 秒
        </small>
      </Show>
    </div>
  );
  return (
    <section aria-label="午高峰生存挑战" class="rush-game">
      <header class="rush-header">
        <div>
          <p class="eyebrow">开店前，先来一局</p>
          <h2>午高峰 · 30 秒生存挑战</h2>
          <p>24 位顾客，一口灶。你的手速能救下几单？</p>
        </div>
        <div class="rush-score">
          <strong>{(30 - state().tick / 10).toFixed(1)}s</strong>
          <span>
            🥡 {served()} 准时 / 💢 {lost()} 离席
          </span>
        </div>
      </header>
      <RushDiorama automatic={automatic} playing={playing} started={started} state={state} />
      <div class="rush-controls">
        <Button class="button button-primary" onClick={() => start(false)} type="button">
          {started() ? "手动再战" : "开门！我来接单"}
        </Button>
        <Show when={started() && !ended()}>
          <Button
            class="button button-secondary"
            onClick={() => setPlaying((p) => !p)}
            type="button"
          >
            {playing() ? "暂停营业" : "继续营业"}
          </Button>
        </Show>
        <Show when={started()}>
          <Button class="button button-secondary" onClick={() => start(true)} type="button">
            让自动排单机挑战同一局
          </Button>
        </Show>
      </div>
      <Show
        when={started()}
        fallback={
          <div class="rush-invitation">
            <span aria-hidden="true">🍳 → 🥡 → 🙂</span>
            <p>认对菜名、挑一张票下锅、端走做好的菜。没有扣分，随时暂停；先试试能不能撑住。</p>
          </div>
        }
      >
        <p aria-live="polite" class="rush-announcer">
          {ended()
            ? `打烊！${served()} 单准时，${lost()} 位顾客等不及了。${automatic() && manualScore() !== null ? `你刚才手动救下 ${manualScore()} 单。` : "手点很忙，接下来试试用规则替你排单。"}`
            : note()}
        </p>
        <div class="rush-stations">
          <section aria-label="接单区">
            <h3>
              ① 接单 <span>{stageTickets(["incoming"]).length} 人</span>
            </h3>
            <div class="rush-station-content">
              <For
                each={stageTickets(["incoming"])}
                fallback={<p class="rush-empty">暂时没人，看看厨房。</p>}
              >
                {card}
              </For>
            </div>
          </section>
          <section aria-label="厨房区">
            <h3>
              ② 厨房 <span>一口灶</span>
            </h3>
            <div class="rush-station-content">
              <For
                each={stageTickets(["cooking", "queued"])}
                fallback={<p class="rush-empty">等你写好第一张小票。</p>}
              >
                {card}
              </For>
            </div>
          </section>
          <section aria-label="出餐区">
            <h3>
              ③ 出餐 <span>一位跑堂</span>
            </h3>
            <div class="rush-station-content">
              <For
                each={stageTickets(["delivering", "ready"])}
                fallback={<p class="rush-empty">饭还没好，先去下锅。</p>}
              >
                {card}
              </For>
            </div>
          </section>
        </div>
        <p class="rush-footnote">
          {automatic()
            ? "自动机也不能变出第二口灶。排单能少浪费时间，救不了无限涌入的顾客。"
            : "接下来把重复操作交给系统：先认识小票，再训练 AI，最后亲手写 priority 排单规则。"}
        </p>
      </Show>
    </section>
  );
}
