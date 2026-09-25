export function fmtDate(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return String(v);
  return withTime ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

export function ago(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
}

export const statusLabel: Record<string, string> = { good: 'Good', warn: 'Review', bad: 'Issue', info: 'Info', unknown: 'Unknown', na: 'N/A' };
