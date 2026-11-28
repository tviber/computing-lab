/**
 * In-memory sliding-window limiter. State lives in the owning route factory,
 * so each app instance (and each test) gets a fresh counter. Good enough to
 * blunt credential stuffing on a single-process server — it is not a
 * distributed limiter.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private lastSweepAt: number | null = null;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Number of keys currently retained in the map (intended for tests). */
  get size(): number {
    return this.hits.size;
  }

  private sweepIfDue(now: number): void {
    if (this.lastSweepAt === null) {
      this.lastSweepAt = now;
      return;
    }
    if (now - this.lastSweepAt < this.windowMs) return;
    this.lastSweepAt = now;
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const active = timestamps.filter((at) => at > cutoff);
      if (active.length === 0) {
        this.hits.delete(key);
      } else if (active.length !== timestamps.length) {
        this.hits.set(key, active);
      }
    }
  }

  private prune(key: string, now: number): number[] {
    const existing = this.hits.get(key);
    if (!existing) return [];
    const cutoff = now - this.windowMs;
    const list = existing.filter((at) => at > cutoff);
    if (list.length === 0) {
      this.hits.delete(key);
    } else if (list.length !== existing.length) {
      this.hits.set(key, list);
    }
    return list;
  }

  /** True once `max` hits within the window have already been recorded. */
  exceeded(key: string): boolean {
    const now = Date.now();
    this.sweepIfDue(now);
    return this.prune(key, now).length >= this.max;
  }

  hit(key: string): void {
    const now = Date.now();
    this.sweepIfDue(now);
    const list = this.prune(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
