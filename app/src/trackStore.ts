import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { TrackData } from './core/track.ts';
import { TRACK_FILE_EXTENSION, parseTrackFile, toTrackFile } from './core/trackFile.ts';
import { BUILTIN_TRACKS } from './tracks/index.ts';

const tracksDir = () => {
  const d = new Directory(Paths.document, 'tracks');
  d.create({ idempotent: true, intermediates: true });
  return d;
};

const settingsFile = () => new File(Paths.document, 'settings.json');

function writeText(file: File, text: string) {
  if (!file.exists) file.create();
  file.write(text);
}

export function newTrackId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Built-in circuits first, then the user's, most recently changed first. */
export async function listTracks(): Promise<TrackData[]> {
  const mine: TrackData[] = [];
  for (const f of tracksDir().list()) {
    if (!(f instanceof File) || !f.name.endsWith('.json')) continue;
    try {
      mine.push(JSON.parse(await f.text()));
    } catch {
      // Skip a file left half-written by a crash.
    }
  }
  mine.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return [...BUILTIN_TRACKS, ...mine];
}

export async function getTrack(id: string): Promise<TrackData | null> {
  const builtin = BUILTIN_TRACKS.find((t) => t.id === id);
  if (builtin) return builtin;
  const f = new File(tracksDir(), `${id}.json`);
  return f.exists ? JSON.parse(await f.text()) : null;
}

export function saveTrack(data: TrackData) {
  if (data.builtin) throw new Error('Circuitos que vêm com o app não podem ser alterados.');
  writeText(new File(tracksDir(), `${data.id}.json`), JSON.stringify({ ...data, updatedAt: Date.now() }));
}

export function deleteTrack(id: string) {
  const f = new File(tracksDir(), `${id}.json`);
  if (f.exists) f.delete();
}

export async function getActiveTrackId(): Promise<string> {
  try {
    const f = settingsFile();
    if (f.exists) {
      const id = JSON.parse(await f.text()).activeTrackId;
      if (typeof id === 'string' && (await getTrack(id))) return id;
    }
  } catch {
    // Fall back to the default below.
  }
  return BUILTIN_TRACKS[0].id;
}

export function setActiveTrackId(id: string) {
  writeText(settingsFile(), JSON.stringify({ activeTrackId: id }));
}

/** Open the share sheet (WhatsApp, e-mail, Drive…) with the circuit file. */
export async function shareTrack(data: TrackData) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste aparelho.');
  const slug =
    data.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'circuito';
  const file = new File(Paths.cache, `${slug}${TRACK_FILE_EXTENSION}`);
  writeText(file, JSON.stringify(toTrackFile(data), null, 1));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: `Compartilhar ${data.name}`,
  });
}

/** Pick a shared circuit file and save it as a new track. Null if cancelled. */
export async function importTrack(): Promise<TrackData | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const parsed = parseTrackFile(await new File(res.assets[0].uri).text());
  const data: TrackData = { ...parsed, id: newTrackId() };
  saveTrack(data);
  return data;
}
