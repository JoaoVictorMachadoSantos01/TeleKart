import type { Sample } from './lapTimer.ts';
import { type Track, pointAt } from './track.ts';

export type SimOptions = {
  /** GPS fix rate, Hz. */
  hz: number;
  /** Standard deviation of position noise, meters. */
  noiseM: number;
  /** Per-lap pace multipliers (1 = base pace, 1.02 = 2% slower). Cycles. */
  lapPace: number[];
  /** Start this many meters before the line (out lap). */
  startBeforeM: number;
  seed: number;
};

const DEFAULTS: SimOptions = { hz: 10, noiseM: 0.5, lapPace: [1.03, 1.0, 1.015, 0.995, 1.01], startBeforeM: 200, seed: 1 };

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Speed profile in m/s: slower where the centerline bends. */
function baseSpeed(track: Track, s: number): number {
  const a = pointAt(track, s - 8);
  const b = pointAt(track, s);
  const c = pointAt(track, s + 8);
  const h1 = Math.atan2(b.y - a.y, b.x - a.x);
  const h2 = Math.atan2(c.y - b.y, c.x - b.x);
  let turn = Math.abs(h2 - h1);
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  const vMax = 22; // ~80 km/h
  const vMin = 11; // ~40 km/h
  return Math.max(vMin, vMax - turn * 40);
}

/**
 * Drives a virtual kart around the centerline. Yields GPS samples plus the
 * exact (ground-truth) times the kart crossed the start/finish line.
 */
export class KartSimulator {
  readonly opts: SimOptions;
  private readonly rand: () => number;
  private s: number;
  private t: number;
  readonly crossings: number[] = [];

  readonly track: Track;

  constructor(track: Track, startT = 0, opts: Partial<SimOptions> = {}) {
    this.track = track;
    this.opts = { ...DEFAULTS, ...opts };
    this.rand = rng(this.opts.seed);
    this.s = -this.opts.startBeforeM;
    this.t = startT;
  }

  private gauss(): number {
    const u = Math.max(this.rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
  }

  /** Advance one GPS period and return the fix. */
  next(): Sample {
    const dt = 1 / this.opts.hz;
    const steps = 20;
    let v = 0;
    for (let i = 0; i < steps; i++) {
      const lapIdx = Math.max(0, Math.floor(this.s / this.track.lengthM));
      const pace = this.opts.lapPace[lapIdx % this.opts.lapPace.length];
      v = baseSpeed(this.track, this.s) / pace;
      const h = dt / steps;
      const before = this.s;
      this.s += v * h;
      const L = this.track.lengthM;
      if (Math.floor(before / L) !== Math.floor(this.s / L)) {
        const lineS = Math.floor(this.s / L) * L;
        this.crossings.push(this.t + ((i + (lineS - before) / (this.s - before)) * h) * 1000);
      }
    }
    this.t += dt * 1000;
    const p = pointAt(this.track, this.s);
    const noisy = { x: p.x + this.gauss() * this.opts.noiseM, y: p.y + this.gauss() * this.opts.noiseM };
    const ll = this.track.frame.toLatLon(noisy);
    return { t: this.t, lat: ll.lat, lon: ll.lon, speedMps: v, accuracyM: this.opts.noiseM * 2 };
  }
}
