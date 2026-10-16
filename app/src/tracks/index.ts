import type { TrackData } from '../core/track.ts';
import paladino from './paladino.json';

/** Circuits shipped with the app. */
export const BUILTIN_TRACKS: TrackData[] = [
  {
    id: 'paladino',
    name: paladino.name,
    widthM: 8,
    finishLine: paladino.finishLine,
    centerline: paladino.centerline,
    builtin: true,
  },
];
