export function formatEur(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '-';
  if (opts.compact) {
    return new Intl.NumberFormat('en-DE', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-DE', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatFte(value: number): string {
  return new Intl.NumberFormat('en-DE', { maximumFractionDigits: 1 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-DE').format(Math.round(value));
}
