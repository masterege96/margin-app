// Formatting and money helpers. Money is integer micro-dollars (1 USD = 1,000,000); user input
// is parsed from its decimal string so no float ever touches a stored amount.

export const MICRO = 1_000_000;

export function esc(raw) {
  return String(raw ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Parse a non-negative USD amount like "12", "12.5" or "0.0004" into micro-dollars; null if invalid. */
export function parseUsdToMicro(input) {
  // "." only: "1,000" is ambiguous (thousand or one), so it is rejected rather than guessed.
  const m = /^\s*(\d{1,12})(?:\.(\d*))?\s*$/.exec(String(input ?? ''));
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = (m[2] || '').padEnd(7, '0');
  let micro = whole * MICRO + Number(frac.slice(0, 6));
  if (Number(frac[6]) >= 5) micro += 1; // round half up at the seventh decimal
  return Number.isSafeInteger(micro) ? micro : null;
}

/** Micro-dollars as a plain decimal string for form fields ("12.5", "0.0004"). */
export function microToInput(micro) {
  const n = Math.abs(Number(micro) || 0);
  const whole = Math.floor(n / MICRO);
  const frac = String(n % MICRO).padStart(6, '0').replace(/0+$/, '');
  return `${micro < 0 ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Micro-dollars as an exact decimal string with six places, for exports. */
export function microToExact(micro) {
  const n = Number(micro) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${sign}${Math.floor(a / MICRO)}.${String(a % MICRO).padStart(6, '0')}`;
}

/** Cost of time-based work: minutes / 60 × hourly rate, rounded to the micro-dollar. */
export function timeCostMicro(minutes, hourlyRateMicro) {
  return Math.round((minutes * hourlyRateMicro) / 60);
}

export function usd(micro, small = false) {
  const n = (Number(micro) || 0) / MICRO;
  const tiny = small && Math.abs(n) < 0.01 && n !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: tiny ? 4 : 2,
    maximumFractionDigits: tiny ? 6 : 2,
  }).format(n);
}

export function pct(n) {
  return n == null ? '—' : `${Number(n).toFixed(1)}%`;
}

export function localDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

export function shortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

export function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function today() {
  return isoDay(new Date());
}

/** CSV cell with formula-injection guard (cells starting with = + @ - get a leading quote). */
export function safeCsvCell(v) {
  let s = String(v ?? '');
  if (/^[\s]*[=+@-]/.test(s) && !/^\s*-?\d+(\.\d+)?\s*$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
