import { type LatLon, type XY, LocalFrame, destination, distanceM } from './geo.ts';

/** A timing line: centre, travel bearing and width. */
export type Gate = {
  center: LatLon;
  /** Direction of travel across the line, degrees. */
  bearingDeg: number;
  widthM: number;
  /** Only count crossings within ±90° of `bearingDeg`. */
  uniDirectional: boolean;
};

/**
 * A circuit as stored and shared. Points are [lat, lon] in degrees. The
 * centerline is a closed loop in the direction of travel; `finishLine` is
 * two points across the track.
 */
export type TrackData = {
  id: string;
  name: string;
  /** Track width in meters, used to draw the track limits. */
  widthM?: number;
  finishLine: number[][];
  centerline: number[][];
  /** Shipped with the app; can be copied but not changed. */
  builtin?: boolean;
  updatedAt?: number;
};

export type Track = {
  id: string;
  name: string;
  widthM: number;
  frame: LocalFrame;
  gate: Gate;
  gateA: XY;
  gateB: XY;
  /** Centerline in travel order, starting exactly on the start/finish line. */
  line: XY[];
  /** Cumulative distance along `line`, meters; last entry = closing length. */
  cum: number[];
  lengthM: number;
};

export const DEFAULT_TRACK_WIDTH_M = 8;
/** Minimum gate width: wider than the track so GPS error never misses it. */
const MIN_GATE_WIDTH_M = 30;

/** Nearest point to `p` on the closed polyline `pts`: segment index and fraction. */
function nearestOnLoop(pts: XY[], p: XY): { i: number; t: number; d: number } {
  let best = { i: 0, t: 0, d: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < best.d) best = { i, t, d };
  }
  return best;
}

export function buildTrack(data: TrackData): Track {
  const [f0, f1] = data.finishLine;
  if (!f0 || !f1) throw new Error('Linha de chegada precisa de 2 pontos');
  const center: LatLon = { lat: (f0[0] + f1[0]) / 2, lon: (f0[1] + f1[1]) / 2 };
  const frame = new LocalFrame(center);

  // Drop repeated points; they would make zero-length segments.
  const xy: XY[] = [];
  for (const [lat, lon] of data.centerline) {
    const p = frame.toXY({ lat, lon });
    const prev = xy[xy.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.01) xy.push(p);
  }
  if (xy.length > 1 && Math.hypot(xy[0].x - xy[xy.length - 1].x, xy[0].y - xy[xy.length - 1].y) <= 0.01) xy.pop();
  if (xy.length < 3) throw new Error('Traçado precisa de pelo menos 3 pontos');

  // Start the line exactly where it meets the finish line, so lap distance 0
  // is the line even when the drawn points are far apart.
  const { i, t } = nearestOnLoop(xy, { x: 0, y: 0 });
  const a = xy[i];
  const b = xy[(i + 1) % xy.length];
  const start: XY = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  const rest = [...xy.slice(i + 1), ...xy.slice(0, i + 1)];
  const line = [start, ...rest.filter((p) => Math.hypot(p.x - start.x, p.y - start.y) > 0.01)];

  const cum = [0];
  for (let k = 1; k <= line.length; k++) {
    const p = line[k - 1];
    const q = line[k % line.length];
    cum.push(cum[k - 1] + Math.hypot(q.x - p.x, q.y - p.y));
  }

  const widthM = data.widthM ?? DEFAULT_TRACK_WIDTH_M;
  const drawnWidth = distanceM({ lat: f0[0], lon: f0[1] }, { lat: f1[0], lon: f1[1] });
  const gateWidthM = Math.max(MIN_GATE_WIDTH_M, drawnWidth, widthM + 20);
  const gate: Gate = {
    center,
    // Direction of travel = direction of the centerline segment at the line.
    bearingDeg: ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360,
    widthM: gateWidthM,
    uniDirectional: true,
  };
  const ga = destination(center, gate.bearingDeg - 90, gateWidthM / 2);
  const gb = destination(center, gate.bearingDeg + 90, gateWidthM / 2);

  return {
    id: data.id,
    name: data.name,
    widthM,
    frame,
    gate,
    gateA: frame.toXY(ga),
    gateB: frame.toXY(gb),
    line,
    cum,
    lengthM: cum[cum.length - 1],
  };
}

export type Projection = { s: number; index: number; offsetM: number };

/**
 * Project a point onto the centerline. `s` is the distance from the
 * start/finish line in meters. With `hint`, only segments within `windowM`
 * of the hinted distance are searched — needed because parts of a kart track
 * run within ~20 m of each other.
 */
export function project(track: Track, p: XY, hint?: number, windowM = 60): Projection {
  const { line, cum, lengthM } = track;
  const n = line.length;
  let best: Projection = { s: 0, index: 0, offsetM: Infinity };
  for (let i = 0; i < n; i++) {
    if (hint !== undefined) {
      let d = Math.abs(cum[i] - hint) % lengthM;
      d = Math.min(d, lengthM - d);
      if (d > windowM) continue;
    }
    const a = line[i];
    const b = line[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const off = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (off < best.offsetM) {
      best = { s: cum[i] + t * (cum[i + 1] - cum[i]), index: i, offsetM: off };
    }
  }
  return best;
}

/** Point on the centerline at distance `s` (wraps around). */
export function pointAt(track: Track, s: number): XY {
  const { line, cum, lengthM } = track;
  const d = ((s % lengthM) + lengthM) % lengthM;
  let lo = 0;
  let hi = line.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = line[lo];
  const b = line[(lo + 1) % line.length];
  const seg = cum[lo + 1] - cum[lo];
  const t = seg === 0 ? 0 : (d - cum[lo]) / seg;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * Track limits: the centerline offset by half the width on each side, as
 * closed loops (first point repeated at the end) ready to draw on a map.
 */
export function trackBorders(track: Track): { left: LatLon[]; right: LatLon[] } {
  const { line, frame } = track;
  const half = track.widthM / 2;
  const n = line.length;
  const left: LatLon[] = [];
  const right: LatLon[] = [];
  for (let k = 0; k < n; k++) {
    const prev = line[(k - 1 + n) % n];
    const next = line[(k + 1) % n];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Right-hand normal of the travel direction (x east, y north).
    const nx = ty / len;
    const ny = -tx / len;
    const p = line[k];
    left.push(frame.toLatLon({ x: p.x - nx * half, y: p.y - ny * half }));
    right.push(frame.toLatLon({ x: p.x + nx * half, y: p.y + ny * half }));
  }
  left.push(left[0]);
  right.push(right[0]);
  return { left, right };
}
