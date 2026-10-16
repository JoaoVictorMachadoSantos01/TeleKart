import { Directory, File, Paths } from 'expo-file-system';

export type LapSummary = { number: number; timeMs: number; maxSpeedKmh: number };

export type SessionSummary = {
  id: string;
  track: string;
  trackId?: string;
  source: 'gps' | 'sim';
  startedAt: number;
  laps: LapSummary[];
  bestMs: number | null;
};

/** Raw fixes, stored column by column (one array per channel). */
export type SessionSamples = {
  t: number[];
  lat: number[];
  lon: number[];
  speedMps: number[];
  accuracyM: number[];
};

const dir = () => {
  const d = new Directory(Paths.document, 'sessions');
  d.create({ idempotent: true, intermediates: true });
  return d;
};

function writeJson(name: string, value: unknown) {
  const f = new File(dir(), name);
  if (!f.exists) f.create();
  f.write(JSON.stringify(value));
}

export function saveSession(summary: SessionSummary, samples: SessionSamples) {
  writeJson(`${summary.id}.json`, summary);
  writeJson(`${summary.id}.samples.json`, samples);
}

export async function listSessions(): Promise<SessionSummary[]> {
  const files = dir()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json') && !f.name.endsWith('.samples.json'));
  const out: SessionSummary[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await f.text()));
    } catch {
      // Skip a file left half-written by a crash.
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export async function loadSession(id: string): Promise<SessionSummary | null> {
  const f = new File(dir(), `${id}.json`);
  return f.exists ? JSON.parse(await f.text()) : null;
}

export function deleteSession(id: string) {
  for (const name of [`${id}.json`, `${id}.samples.json`]) {
    const f = new File(dir(), name);
    if (f.exists) f.delete();
  }
}
