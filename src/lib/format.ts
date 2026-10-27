// English with euro-area conventions: "€29.1M", "295.5", "70%". (The previous 'en-DE' mixed styles:
// currencies came out as "€29.1M" but plain numbers and percentages as "295,5" and "70 %".)
const LOCALE = 'en-IE';

export function formatEur(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '-';
  if (opts.compact) {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** "70%"; with `signed`, "+20%" / "-10%" / "0%". */
export function formatPct(value: number, digits = 0, opts: { signed?: boolean } = {}): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  }).format(value);
}

export function formatFte(value: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(Math.round(value));
}

/** Months with one decimal, e.g. "0.5 months", "1 month". */
export function formatMonths(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const text = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value);
  return `${text} ${text === '1' ? 'month' : 'months'}`;
}
