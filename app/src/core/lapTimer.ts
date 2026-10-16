import { type XY, angleDiffDeg, distanceM, bearingDeg, segmentCrossing } from './geo.ts';
import { type Track, project } from './track.ts';

export type Sample = {
  /** Epoch milliseconds (GPS fix time). */
  t: number;
  lat: number;
  lon: number;
  speedMps?: number | null;
  accuracyM?: number | null;
};

/** One point of a lap: time since lap start (ms) at lap distance (m). */
export type TracePoint = { t: number; s: number };

export type Lap = {
  number: number;
  startT: number;
  timeMs: number;
  maxSpeedKmh: number;
  trace: TracePoint[];
};

export type LapEvent =
  | { type: 'lapStarted'; number: number }
  | { type: 'lapCompleted'; lap: Lap; isBest: boolean }
  | { type: 'lapDiscarded'; number: number };

export type TimerOptions = {
  /** Laps shorter than this (meters) are dropped (e.g. crossing back over the line in the pits). */
  minLapDistanceM: number;
  /** Reference gaps longer than this make the delta unknown instead of guessed. */
  maxReferenceGapMs: number;
  /** Beyond this distance from the centerline, fall back to GPS distance. */
  maxOffTrackM: number;
};

const DEFAULTS: TimerOptions = { minLapDistanceM: 100, maxReferenceGapMs: 15000, maxOffTrackM: 40 };

/**
 * Live lap timing:
 * segment/line intersection with linear time interpolation, a lap builder
 * that drops too-short laps, and delta = elapsed time minus the reference
 * lap's time at the same lap distance. Lap distance comes from projecting
 * onto the track centerline, so it is consistent from lap to lap.
 */
export class LapTimer {
  readonly opts: TimerOptions;
  readonly laps: Lap[] = [];
  best: Lap | null = null;

  lapNumber = 0;
  lapStartT: number | null = null;
  lapDistanceM = 0;
  deltaMs: number | null = null;

  private prev: { sample: Sample; xy: XY } | null = null;
  private skipNext = false;
  private hintS: number | undefined;
  private trace: TracePoint[] = [];
  private maxSpeedKmh = 0;

  readonly track: Track;

  constructor(track: Track, opts: Partial<TimerOptions> = {}) {
    this.track = track;
    this.opts = { ...DEFAULTS, ...opts };
  }

  get lastLap(): Lap | null {
    return this.laps.length ? this.laps[this.laps.length - 1] : null;
  }

  get predictedMs(): number | null {
    return this.best && this.deltaMs !== null ? this.best.timeMs + this.deltaMs : null;
  }

  push(sample: Sample): LapEvent[] {
    const events: LapEvent[] = [];
    const prev = this.prev;
    if (prev && sample.t <= prev.sample.t) return events;
    const xy = this.track.frame.toXY(sample);

    if (prev) {
      if (this.skipNext) {
        this.skipNext = false;
      } else {
        const u = segmentCrossing(prev.xy, xy, this.track.gateA, this.track.gateB);
        if (u !== null && this.directionOk(prev.sample, sample)) {
          const tc = prev.sample.t + u * (sample.t - prev.sample.t);
          this.onCrossing(tc, events);
          // Do not let the next segment re-trigger when a fix lands on the line.
          this.skipNext = true;
        }
      }
    }

    this.updateDistance(sample, xy, prev?.sample);
    this.prev = { sample, xy };
    return events;
  }

  private directionOk(a: Sample, b: Sample): boolean {
    if (!this.track.gate.uniDirectional) return true;
    return Math.abs(angleDiffDeg(bearingDeg(a, b), this.track.gate.bearingDeg)) < 90;
  }

  private onCrossing(tc: number, events: LapEvent[]) {
    if (this.lapStartT !== null) {
      if (this.lapDistanceM < this.opts.minLapDistanceM) {
        events.push({ type: 'lapDiscarded', number: this.lapNumber });
        this.lapNumber -= 1;
      } else {
        const timeMs = tc - this.lapStartT;
        this.trace.push({ t: timeMs, s: Math.max(this.track.lengthM, this.lapDistanceM) });
        const lap: Lap = {
          number: this.lapNumber,
          startT: this.lapStartT,
          timeMs,
          maxSpeedKmh: this.maxSpeedKmh,
          trace: this.trace,
        };
        const isBest = !this.best || timeMs < this.best.timeMs;
        this.laps.push(lap);
        if (isBest) this.best = lap;
        events.push({ type: 'lapCompleted', lap, isBest });
      }
    }
    this.lapNumber += 1;
    this.lapStartT = tc;
    this.lapDistanceM = 0;
    this.trace = [{ t: 0, s: 0 }];
    this.maxSpeedKmh = 0;
    this.hintS = 0;
    this.deltaMs = null;
    events.push({ type: 'lapStarted', number: this.lapNumber });
  }

  private updateDistance(sample: Sample, xy: XY, prev: Sample | undefined) {
    const { lengthM } = this.track;
    const proj = project(this.track, xy, this.hintS);
    const onTrack = proj.offsetM <= this.opts.maxOffTrackM;
    this.hintS = onTrack ? proj.s : undefined;
    if (this.lapStartT === null) return;

    let s: number;
    if (onTrack) {
      s = proj.s;
      // Unwrap around the start/finish line.
      if (this.lapDistanceM < lengthM / 2 && s > lengthM * 0.75) s -= lengthM;
      else if (this.lapDistanceM > lengthM / 2 && s < lengthM * 0.25) s += lengthM;
    } else {
      s = this.lapDistanceM + (prev ? distanceM(prev, sample) : 0);
    }
    // Keep the trace monotonic so it can be searched by distance.
    s = Math.max(s, this.lapDistanceM);
    this.lapDistanceM = s;

    const t = sample.t - this.lapStartT;
    this.trace.push({ t, s });
    const kmh = (sample.speedMps ?? 0) * 3.6;
    if (kmh > this.maxSpeedKmh) this.maxSpeedKmh = kmh;

    const refT = this.best ? referenceTimeAt(this.best.trace, s, this.opts.maxReferenceGapMs) : null;
    this.deltaMs = refT === null ? null : t - refT;
  }
}

/**
 * Reference lap time at lap distance `s`, linearly interpolated between the
 * two surrounding samples (binary search on distance). Returns
 * null outside the reference or across a gap in its data.
 */
export function referenceTimeAt(trace: TracePoint[], s: number, maxGapMs = 15000): number | null {
  if (trace.length < 2 || s < trace[0].s || s > trace[trace.length - 1].s) return null;
  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  if (b.t - a.t > maxGapMs) return null;
  const f = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  return a.t + f * (b.t - a.t);
}
