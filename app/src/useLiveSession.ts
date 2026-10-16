import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { LapTimer, type Lap, type Sample } from './core/lapTimer.ts';
import { KartSimulator } from './core/simulator.ts';
import type { Track } from './core/track.ts';
import { saveSession, type SessionSamples, type SessionSummary } from './storage.ts';

export type Source = 'gps' | 'sim';

export type LiveState = {
  status: 'starting' | 'running' | 'denied' | 'error';
  error?: string;
  lapNumber: number;
  /** Start of the current lap in the clock's time base, or null on the out lap. */
  lapStartT: number | null;
  deltaMs: number | null;
  predictedMs: number | null;
  last: Lap | null;
  best: Lap | null;
  laps: Lap[];
  speedKmh: number;
  accuracyM: number | null;
  rateHz: number;
  /** Lap shown big for a few seconds right after crossing the line. */
  flash: { lap: Lap; isBest: boolean } | null;
};

const FLASH_MS = 5000;

/**
 * Runs a timing session from the phone GPS or the simulator, records every fix
 * and saves the session after each lap and when stopped.
 */
export function useLiveSession(track: Track, source: Source) {
  const timerRef = useRef(new LapTimer(track));
  const samplesRef = useRef<SessionSamples>({ t: [], lat: [], lon: [], speedMps: [], accuracyM: [] });
  const startedAt = useRef(Date.now());
  const id = useRef(`${new Date(startedAt.current).toISOString().replace(/[:.]/g, '-')}`);
  // Maps wall-clock time to the sample time base, so the lap clock runs between fixes.
  const clockOffset = useRef(0);
  const fixTimes = useRef<number[]>([]);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<LiveState>({
    status: 'starting',
    lapNumber: 0,
    lapStartT: null,
    deltaMs: null,
    predictedMs: null,
    last: null,
    best: null,
    laps: [],
    speedKmh: 0,
    accuracyM: null,
    rateHz: 0,
    flash: null,
  });

  const save = useCallback(() => {
    const timer = timerRef.current;
    if (samplesRef.current.t.length === 0) return;
    const summary: SessionSummary = {
      id: id.current,
      track: track.name,
      trackId: track.id,
      source,
      startedAt: startedAt.current,
      laps: timer.laps.map((l) => ({ number: l.number, timeMs: l.timeMs, maxSpeedKmh: l.maxSpeedKmh })),
      bestMs: timer.best?.timeMs ?? null,
    };
    try {
      saveSession(summary, samplesRef.current);
    } catch (e) {
      console.warn('saveSession failed', e);
    }
  }, [track.name, track.id, source]);

  const onSample = useCallback(
    (s: Sample) => {
      const timer = timerRef.current;
      const events = timer.push(s);
      const rec = samplesRef.current;
      rec.t.push(s.t);
      rec.lat.push(s.lat);
      rec.lon.push(s.lon);
      rec.speedMps.push(s.speedMps ?? NaN);
      rec.accuracyM.push(s.accuracyM ?? NaN);

      clockOffset.current = Date.now() - s.t;
      const times = fixTimes.current;
      times.push(s.t);
      while (times.length > 0 && s.t - times[0] > 3000) times.shift();
      const rateHz = times.length > 1 ? ((times.length - 1) * 1000) / (times[times.length - 1] - times[0]) : 0;

      const done = events.find((e) => e.type === 'lapCompleted');
      if (done && done.type === 'lapCompleted') {
        if (flashTimeout.current) clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => setState((st) => ({ ...st, flash: null })), FLASH_MS);
        save();
      }

      setState((st) => ({
        ...st,
        status: 'running',
        lapNumber: timer.lapNumber,
        lapStartT: timer.lapStartT,
        deltaMs: timer.deltaMs,
        predictedMs: timer.predictedMs,
        last: timer.lastLap,
        best: timer.best,
        laps: [...timer.laps],
        speedKmh: (s.speedMps ?? 0) * 3.6,
        accuracyM: s.accuracyM ?? null,
        rateHz,
        flash: done && done.type === 'lapCompleted' ? { lap: done.lap, isBest: done.isBest } : st.flash,
      }));
    },
    [save],
  );

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;

    if (source === 'sim') {
      const sim = new KartSimulator(track, Date.now(), { hz: 10, noiseM: 0.8 });
      const handle = setInterval(() => onSample(sim.next()), 100);
      stop = () => clearInterval(handle);
    } else {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setState((st) => ({ ...st, status: 'denied' }));
          return;
        }
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 100, distanceInterval: 0 },
          (loc) =>
            onSample({
              t: loc.timestamp,
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              speedMps: loc.coords.speed,
              accuracyM: loc.coords.accuracy,
            }),
          (err) => setState((st) => ({ ...st, status: 'error', error: err })),
        );
        if (cancelled) sub.remove();
        else stop = () => sub.remove();
      })().catch((e) => setState((st) => ({ ...st, status: 'error', error: String(e) })));
    }

    return () => {
      cancelled = true;
      stop?.();
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      save();
    };
  }, [track, source, onSample, save]);

  /** Current time in the sample time base. */
  const now = useCallback(() => Date.now() - clockOffset.current, []);

  return { state, now };
}
