import { createEffect, createMemo, createSignal } from "solid-js";
import type { RunSummary } from "../domain/contracts.ts";
import { replayCaption, replayFrames } from "./queueModel";

export function useQueueReplay(run: () => RunSummary, autoPlay: () => boolean | undefined) {
  // The simulation is parallel, but watching several stations at once is
  // unreadable — the replay advances one tick at a time and shows every
  // station action that happened on that tick.
  const events = () => run().events ?? [];
  const frames = createMemo(() => replayFrames(events()));
  const [step, setStep] = createSignal(0);
  const [playing, setPlaying] = createSignal(Boolean(autoPlay()));

  createEffect(run, () => {
    setStep(0);
    setPlaying(Boolean(autoPlay()));
  });

  createEffect(
    () => (playing() ? frames().length : 0),
    (length) => {
      if (length === 0) return;
      const timer = window.setInterval(
        () =>
          setStep((current) => {
            if (current >= length - 1) {
              setPlaying(false);
              return current;
            }
            return current + 1;
          }),
        650,
      );
      return () => window.clearInterval(timer);
    },
  );

  const current = () => frames()[step()];
  const lastTick = () => current()?.tick ?? 0;
  // Draw only the ticks revealed so far, so the map never gets ahead of
  // the caption.
  const viewRun = createMemo(() => ({
    ...run(),
    events: events().filter((event) => event.tick <= lastTick()),
  }));
  const atEnd = () => frames().length > 0 && step() >= frames().length - 1;

  return {
    frames,
    step,
    playing,
    current,
    viewRun,
    caption: () => replayCaption(current()),
    atEnd,
    onSeek: (value: string) => {
      setPlaying(false);
      setStep(Number(value) || 0);
    },
    togglePlay: () => {
      if (!playing() && atEnd()) setStep(0);
      setPlaying((value) => !value);
    },
  };
}
