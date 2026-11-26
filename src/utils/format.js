const compactFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const numberFormatter = new Intl.NumberFormat(undefined);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export const METRICS = [
  { id: 'code', label: 'Code', longLabel: 'Lines of code', short: 'LOC' },
  { id: 'comment', label: 'Comments', longLabel: 'Comment lines', short: 'comments' },
  { id: 'blank', label: 'Blanks', longLabel: 'Blank lines', short: 'blanks' },
  { id: 'lines', label: 'Total', longLabel: 'Total lines', short: 'lines' },
];

export function metricLabel(metric) {
  return METRICS.find((item) => item.id === metric) ?? METRICS[0];
}

export function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

export function formatCompact(value) {
  return compactFormatter.format(Math.round(Number(value) || 0));
}

export function formatDelta(value, compact = false) {
  const numeric = Math.round(Number(value) || 0);
  if (numeric === 0) return compact ? '0' : '0';
  const absolute = Math.abs(numeric);
  const rendered = compact ? formatCompact(absolute) : formatNumber(absolute);
  return `${numeric > 0 ? '+' : '−'}${rendered}`;
}

export function formatPercent(value, digits = 1) {
  const numeric = Number(value) || 0;
  return `${numeric.toFixed(digits)}%`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value) {
  if (!value) return '—';
  const difference = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(difference)) return '—';
  if (difference < 60_000) return 'just now';
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  if (difference < 2_592_000_000) return `${Math.floor(difference / 86_400_000)}d ago`;
  return formatDate(value);
}

export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, '0')}s`;
}

export function spanLabel(firstDate, lastDate) {
  if (!firstDate || !lastDate) return '—';
  const days = Math.max(1, (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86_400_000);
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

export function rangeLabel(firstDate, lastDate) {
  if (!firstDate || !lastDate) return '—';
  const first = new Date(firstDate);
  const last = new Date(lastDate);
  const sameYear = first.getFullYear() === last.getFullYear();
  const firstLabel = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(first);
  return `${firstLabel} – ${formatShortDate(last)}, ${last.getFullYear()}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function sanitizeFilename(value) {
  return String(value ?? 'cloc-history')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cloc-history';
}
