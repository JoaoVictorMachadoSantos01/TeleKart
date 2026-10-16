import type { TrackData } from './track.ts';

/** Shareable circuit file (`*.telekart.json`). */
export type TrackFile = {
  format: 'telekart-track';
  version: 1;
  track: Omit<TrackData, 'builtin'>;
};

export const TRACK_FILE_EXTENSION = '.telekart.json';

export function toTrackFile(data: TrackData): TrackFile {
  const { builtin: _builtin, ...track } = data;
  return { format: 'telekart-track', version: 1, track };
}

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length >= 2 &&
  typeof p[0] === 'number' &&
  typeof p[1] === 'number' &&
  Math.abs(p[0]) <= 90 &&
  Math.abs(p[1]) <= 180;

/**
 * Parse a circuit from a shared file. Accepts a TeleKart track file or a bare
 * track object (like `data/tracks/paladino.json`). Throws with a message in
 * Portuguese that can be shown to the user.
 */
export function parseTrackFile(text: string): Omit<TrackData, 'id'> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const obj = json as Record<string, unknown>;
  const raw = (obj?.format === 'telekart-track' ? obj.track : obj) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo de circuito inválido.');

  const { name, widthM, finishLine, centerline } = raw;
  if (typeof name !== 'string' || !name.trim()) throw new Error('O circuito não tem nome.');
  if (!Array.isArray(centerline) || centerline.length < 3 || !centerline.every(isPoint)) {
    throw new Error('O traçado precisa de pelo menos 3 pontos válidos.');
  }
  if (!Array.isArray(finishLine) || finishLine.length !== 2 || !finishLine.every(isPoint)) {
    throw new Error('A linha de chegada precisa de 2 pontos válidos.');
  }
  return {
    name: name.trim(),
    widthM: typeof widthM === 'number' && widthM > 0 && widthM < 100 ? widthM : undefined,
    finishLine: finishLine.map(([lat, lon]) => [lat, lon]),
    centerline: centerline.map(([lat, lon]) => [lat, lon]),
  };
}
