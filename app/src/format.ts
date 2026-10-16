/** 83456 → "1:23.45" */
export function formatLap(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '–:––.––';
  const cs = Math.max(0, Math.round(ms / 10));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** -420 → "-0.42", 1234 → "+1.23" */
export function formatDelta(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '±–.––';
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}`;
}

export function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
