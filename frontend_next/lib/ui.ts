export const buttonPrimary =
  'inline-flex items-center justify-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60';

export const buttonSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export const labelClass = 'grid gap-1.5 text-sm font-medium text-slate-700';

export const panelClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-soft';

export function statusClass(status?: string | null) {
  const value = status || 'new';
  if (['missing', 'urgent', 'queued', 'new'].includes(value)) return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (['found', 'safe', 'sent', 'verified', 'acknowledged'].includes(value)) return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (['closed', 'dismissed', 'failed', 'archived'].includes(value)) return 'bg-slate-100 text-slate-700 ring-slate-200';
  return 'bg-sky-50 text-sky-800 ring-sky-200';
}

export function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}
