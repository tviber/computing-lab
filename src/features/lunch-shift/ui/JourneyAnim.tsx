/**
 * 3-frame looping animation for the journey illustrations — frames beyond
 * the first are optional; missing files just don't join the cycle.
 */

import { useEffect, useState } from "react";

export function JourneyAnim({ base, alt }: { base: string; alt: string }) {
  const [frames, setFrames] = useState<string[]>([`/assets/lunch-shift/${base}.png`]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    const candidates = [1, 2, 3].map(
      (n) => `/assets/lunch-shift/${base}${n > 1 ? `-${n}` : ""}.png`,
    );
    const loaded: string[] = [];
    Promise.all(
      candidates.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              loaded.push(src);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    ).then(() => {
      if (alive && loaded.length) setFrames(candidates.filter((src) => loaded.includes(src)));
    });
    return () => {
      alive = false;
    };
  }, [base]);

  useEffect(() => {
    if (frames.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 700);
    return () => window.clearInterval(timer);
  }, [frames.length]);

  return (
    <img
      alt={alt}
      className="lunch-journey-img"
      onError={(e) => e.currentTarget.remove()}
      src={frames[index]}
    />
  );
}
