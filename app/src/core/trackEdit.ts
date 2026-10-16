import { type LatLon, LocalFrame } from './geo.ts';

/**
 * Index at which to insert `p` into the closed loop `pts` so it lands on the
 * nearest segment (including the closing one, last → first).
 */
export function insertionIndex(pts: LatLon[], p: LatLon): number {
  if (pts.length < 2) return pts.length;
  const frame = new LocalFrame(p);
  const xy = pts.map((q) => frame.toXY(q));
  let best = { i: pts.length, d: Infinity };
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (d < best.d) best = { i: i + 1, d };
  }
  return best.i;
}

/** Same loop, opposite direction of travel, keeping the first point. */
export function reverseLoop<T>(pts: T[]): T[] {
  return pts.length < 2 ? [...pts] : [pts[0], ...pts.slice(1).reverse()];
}

/**
 * Douglas–Peucker simplification of a closed loop: drops points that are
 * within `toleranceM` of the simplified line. Keeps the first point.
 */
export function simplifyLoop(pts: LatLon[], toleranceM: number): LatLon[] {
  if (pts.length <= 4) return [...pts];
  const frame = new LocalFrame(pts[0]);
  const xy = pts.map((p) => frame.toXY(p));
  // Split the loop at the point farthest from the start, then simplify both halves.
  let far = 1;
  let farD = 0;
  xy.forEach((p, i) => {
    const d = Math.hypot(p.x - xy[0].x, p.y - xy[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const keep = new Array<boolean>(xy.length).fill(false);
  keep[0] = keep[far] = true;
  const ring = [...xy, xy[0]];
  const stack: [number, number][] = [
    [0, far],
    [far, xy.length],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = ring[a];
    const pb = ring[b];
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy);
    let idx = -1;
    let maxD = 0;
    for (let i = a + 1; i < b; i++) {
      const p = ring[i];
      const d = len === 0 ? Math.hypot(p.x - pa.x, p.y - pa.y) : Math.abs(dx * (pa.y - p.y) - dy * (pa.x - p.x)) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
