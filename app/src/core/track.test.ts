/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalFrame, distanceM } from './geo.ts';
import { buildTrack, project, trackBorders, type TrackData } from './track.ts';
import { parseTrackFile, toTrackFile } from './trackFile.ts';
import { LapTimer } from './lapTimer.ts';
import { KartSimulator } from './simulator.ts';

// A 200 m × 100 m rectangle drawn clockwise with only its 4 corners, like a
// user tapping on the map. Finish line across the middle of the top side.
const frame = new LocalFrame({ lat: -7.25, lon: -34.93 });
const ll = (x: number, y: number) => {
  const p = frame.toLatLon({ x, y });
  return [p.lat, p.lon];
};
const square: TrackData = {
  id: 't1',
  name: 'Retângulo',
  widthM: 10,
  centerline: [ll(0, 100), ll(200, 100), ll(200, 0), ll(0, 0)],
  finishLine: [ll(100, 105), ll(100, 95)],
};

test('sparse hand-drawn track starts exactly on the finish line', () => {
  const t = buildTrack(square);
  assert.ok(Math.abs(t.lengthM - 600) < 0.5, `length ${t.lengthM}`);
  const start = t.frame.toLatLon(t.line[0]);
  const gate = t.gate.center;
  assert.ok(distanceM(start, gate) < 0.5, 'line[0] is on the gate');
  assert.ok(Math.abs(t.gate.bearingDeg - 90) < 1, `bearing ${t.gate.bearingDeg}`);
  assert.ok(t.gate.widthM >= 30);
  // Projection: a point 50 m past the line on the top side is at s = 50.
  const p = project(t, t.frame.toXY({ lat: ll(150, 100)[0], lon: ll(150, 100)[1] }));
  assert.ok(Math.abs(p.s - 50) < 0.5, `s ${p.s}`);
});

test('borders are half the width away from the centerline', () => {
  const t = buildTrack(square);
  const { left, right } = trackBorders(t);
  assert.equal(left.length, t.line.length + 1);
  const mid = t.frame.toLatLon(t.line[0]);
  assert.ok(Math.abs(distanceM(left[0], mid) - 5) < 0.1);
  assert.ok(Math.abs(distanceM(right[0], mid) - 5) < 0.1);
  // Clockwise track: the right border is on the inside (south of the top side).
  assert.ok(t.frame.toXY(right[0]).y < t.frame.toXY(left[0]).y);
});

test('laps are timed on a hand-drawn track', () => {
  const t = buildTrack(square);
  const sim = new KartSimulator(t, 0, { hz: 5, noiseM: 0 });
  const timer = new LapTimer(t);
  for (let i = 0; i < 5 * 200; i++) timer.push(sim.next());
  const truth = sim.crossings.slice(1).map((c, i) => c - sim.crossings[i]);
  assert.ok(timer.laps.length >= 3, `laps ${timer.laps.length}`);
  timer.laps.forEach((lap, i) => assert.ok(Math.abs(lap.timeMs - truth[i]) < 5));
});

test('rejects tracks that cannot be timed', () => {
  assert.throws(() => buildTrack({ ...square, centerline: square.centerline.slice(0, 2) }), /3 pontos/);
  assert.throws(() => buildTrack({ ...square, finishLine: [] }), /2 pontos/);
});

test('track files round-trip and bad files give readable errors', () => {
  const file = toTrackFile({ ...square, builtin: true });
  assert.equal(file.format, 'telekart-track');
  assert.equal('builtin' in file.track, false);
  const back = parseTrackFile(JSON.stringify(file));
  assert.equal(back.name, 'Retângulo');
  assert.equal(back.widthM, 10);
  assert.deepEqual(back.centerline, square.centerline);
  assert.throws(() => parseTrackFile('not json'), /JSON/);
  assert.throws(() => parseTrackFile(JSON.stringify({ name: 'x', centerline: [], finishLine: [] })), /3 pontos/);
});
