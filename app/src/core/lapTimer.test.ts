/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { segmentCrossing } from './geo.ts';
import { buildTrack, type TrackData } from './track.ts';
import { LapTimer, referenceTimeAt } from './lapTimer.ts';
import { KartSimulator } from './simulator.ts';

const data: TrackData = {
  id: 'paladino',
  ...JSON.parse(readFileSync(new URL('../tracks/paladino.json', import.meta.url), 'utf8')),
};
const track = buildTrack(data);

function run(opts: ConstructorParameters<typeof KartSimulator>[2], seconds: number) {
  const sim = new KartSimulator(track, 1_700_000_000_000, opts);
  const timer = new LapTimer(track);
  const n = seconds * (opts?.hz ?? 10);
  for (let i = 0; i < n; i++) timer.push(sim.next());
  const truth = sim.crossings.slice(1).map((c, i) => c - sim.crossings[i]);
  return { timer, truth };
}

test('segment crossing returns the fraction along the movement', () => {
  const u = segmentCrossing({ x: 0, y: -1 }, { x: 0, y: 3 }, { x: -5, y: 0 }, { x: 5, y: 0 });
  assert.equal(u, 0.25);
  assert.equal(segmentCrossing({ x: 0, y: 1 }, { x: 0, y: 3 }, { x: -5, y: 0 }, { x: 5, y: 0 }), null);
});

test('track is built from Paladino data', () => {
  assert.ok(Math.abs(track.lengthM - 1246) < 10, `length ${track.lengthM}`);
  assert.ok(Math.abs(track.gate.bearingDeg - 109) < 5, `bearing ${track.gate.bearingDeg}`);
});

for (const hz of [1, 5, 10, 25]) {
  test(`lap times are exact without GPS noise at ${hz} Hz`, () => {
    const { timer, truth } = run({ hz, noiseM: 0 }, 400);
    assert.ok(timer.laps.length >= 4, `laps ${timer.laps.length}`);
    // Linear interpolation assumes constant speed between fixes.
    const tolMs = hz === 1 ? 15 : 3;
    timer.laps.forEach((lap, i) => {
      const err = Math.abs(lap.timeMs - truth[i]);
      assert.ok(err < tolMs, `lap ${lap.number}: err ${err.toFixed(1)} ms`);
    });
  });
}

test('lap times stay within 0.15 s with 0.5 m GPS noise', () => {
  const { timer, truth } = run({ hz: 10, noiseM: 0.5 }, 400);
  timer.laps.forEach((lap, i) => {
    const err = Math.abs(lap.timeMs - truth[i]);
    assert.ok(err < 150, `lap ${lap.number}: err ${err.toFixed(0)} ms`);
  });
});

test('best lap and delta: same pace gives ~0, slower pace gives the time loss', () => {
  const { timer } = run({ hz: 10, noiseM: 0.3, lapPace: [1.0, 1.0, 1.02] }, 300);
  const [l1, l2, l3] = timer.laps;
  assert.ok(l3.timeMs > l2.timeMs);
  const best = l1.timeMs <= l2.timeMs ? l1 : l2;
  // Delta of lap 3 against best at the line equals the lap-time difference.
  const end = l3.trace[l3.trace.length - 2];
  const refT = referenceTimeAt(best.trace, end.s)!;
  const delta = end.t - refT;
  // Pace is uniformly 2% slower, so the loss grows with the reference time.
  const expected = refT * (l3.timeMs / best.timeMs - 1);
  assert.ok(Math.abs(delta - expected) < 150, `delta ${delta.toFixed(0)} expected ~${expected.toFixed(0)}`);
});

test('crossing the line backwards does not count', () => {
  const timer = new LapTimer(track);
  const { gateA, gateB, frame } = track;
  const mid = { x: (gateA.x + gateB.x) / 2, y: (gateA.y + gateB.y) / 2 };
  const dir = { x: Math.sin((track.gate.bearingDeg * Math.PI) / 180), y: Math.cos((track.gate.bearingDeg * Math.PI) / 180) };
  const at = (k: number, t: number) => ({ t, ...frame.toLatLon({ x: mid.x + dir.x * k, y: mid.y + dir.y * k }) });
  const events = [...timer.push(at(5, 0)), ...timer.push(at(-5, 1000))];
  assert.equal(events.length, 0);
  assert.equal(timer.lapNumber, 0);
});

test('a lap shorter than 100 m is discarded', () => {
  const timer = new LapTimer(track);
  const { gateA, gateB, frame } = track;
  const mid = { x: (gateA.x + gateB.x) / 2, y: (gateA.y + gateB.y) / 2 };
  const dir = { x: Math.sin((track.gate.bearingDeg * Math.PI) / 180), y: Math.cos((track.gate.bearingDeg * Math.PI) / 180) };
  const at = (k: number, t: number) => ({ t, ...frame.toLatLon({ x: mid.x + dir.x * k, y: mid.y + dir.y * k }) });
  // Cross forward, drift back behind the line, cross forward again.
  const seq = [at(-5, 0), at(5, 1000), at(8, 2000), at(-5, 3000), at(-6, 4000), at(5, 5000)];
  const events = seq.flatMap((s) => timer.push(s));
  assert.ok(events.some((e) => e.type === 'lapDiscarded'));
  assert.equal(timer.laps.length, 0);
  assert.equal(timer.lapNumber, 1);
});

test('reference lookup refuses to bridge long gaps', () => {
  const trace = [{ t: 0, s: 0 }, { t: 1000, s: 20 }, { t: 30000, s: 40 }];
  assert.equal(referenceTimeAt(trace, 10), 500);
  assert.equal(referenceTimeAt(trace, 30), null);
  assert.equal(referenceTimeAt(trace, 50), null);
});
