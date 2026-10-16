/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalFrame } from './geo.ts';
import type { LatLon } from './geo.ts';
import { insertionIndex, reverseLoop } from './trackEdit.ts';

const frame = new LocalFrame({ lat: -7.25, lon: -34.93 });
const ll = (x: number, y: number) => frame.toLatLon({ x, y });
const square = [ll(0, 100), ll(200, 100), ll(200, 0), ll(0, 0)];

test('inserts a point into the nearest segment of the loop', () => {
  assert.equal(insertionIndex(square, ll(100, 103)), 1); // top side
  assert.equal(insertionIndex(square, ll(203, 50)), 2); // right side
  assert.equal(insertionIndex(square, ll(-3, 50)), 4); // closing side (left)
  assert.equal(insertionIndex(square.slice(0, 1), ll(5, 5)), 1);
});

test('reverses travel direction keeping the first point', () => {
  assert.deepEqual(reverseLoop([1, 2, 3, 4]), [1, 4, 3, 2]);
});

test('simplifies a dense loop without moving it', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildTrack } = await import('./track.ts');
  const { simplifyLoop } = await import('./trackEdit.ts');
  const pal = JSON.parse(readFileSync(new URL('../tracks/paladino.json', import.meta.url), 'utf8'));
  const pts = pal.centerline.map(([lat, lon]: number[]) => ({ lat, lon }));
  const simple = simplifyLoop(pts, 0.5);
  assert.ok(simple.length < pts.length / 3, `${pts.length} → ${simple.length}`);
  const a = buildTrack({ id: 'a', name: 'a', finishLine: pal.finishLine, centerline: pal.centerline });
  const b = buildTrack({ id: 'b', name: 'b', finishLine: pal.finishLine, centerline: simple.map((p: LatLon) => [p.lat, p.lon]) });
  assert.ok(Math.abs(a.lengthM - b.lengthM) < 3, `length ${a.lengthM} vs ${b.lengthM}`);
});
