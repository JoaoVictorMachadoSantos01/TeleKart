export const EARTH_RADIUS_M = 6371000;

export type LatLon = { lat: number; lon: number };
export type XY = { x: number; y: number };

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in meters (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial great-circle bearing from a to b, degrees in [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached from `from` after `distM` meters on `brgDeg`. */
export function destination(from: LatLon, brgDeg: number, distM: number): LatLon {
  const d = distM / EARTH_RADIUS_M;
  const b = rad(brgDeg);
  const lat1 = rad(from.lat);
  const lon1 = rad(from.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: deg(lon2) };
}

/** Signed difference a - b normalized to (-180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Local equirectangular projection in meters around an origin. Accurate to
 * millimeters over a kart track, and cheap enough to run on every fix.
 */
export class LocalFrame {
  private readonly kx: number;
  private readonly ky: number;

  readonly origin: LatLon;

  constructor(origin: LatLon) {
    this.origin = origin;
    this.ky = rad(1) * EARTH_RADIUS_M;
    this.kx = this.ky * Math.cos(rad(origin.lat));
  }

  toXY(p: LatLon): XY {
    return { x: (p.lon - this.origin.lon) * this.kx, y: (p.lat - this.origin.lat) * this.ky };
  }

  toLatLon(p: XY): LatLon {
    return { lat: this.origin.lat + p.y / this.ky, lon: this.origin.lon + p.x / this.kx };
  }
}

/**
 * Intersection of segments p0→p1 and q0→q1. Returns `u`, the fraction along
 * p0→p1 where it crosses, or null (standard 2D cross-product test).
 */
export function segmentCrossing(p0: XY, p1: XY, q0: XY, q1: XY): number | null {
  const rx = p1.x - p0.x;
  const ry = p1.y - p0.y;
  const sx = q1.x - q0.x;
  const sy = q1.y - q0.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const qpx = q0.x - p0.x;
  const qpy = q0.y - p0.y;
  const u = (qpx * sy - qpy * sx) / denom; // along p
  const t = (qpx * ry - qpy * rx) / denom; // along q
  if (u < 0 || u > 1 || t < 0 || t > 1) return null;
  return u;
}
