const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Folds German umlauts/ß to their ASCII digraph form, so "Österreich" and the common
 * keyboard-limited "Oesterreich" spelling normalize to the same thing. */
function foldGerman(s: string): string {
  return s
    .replace(/ß/g, 'ss')
    .replace(/ä/gi, (m) => (m === m.toUpperCase() ? 'AE' : 'ae'))
    .replace(/ö/gi, (m) => (m === m.toUpperCase() ? 'OE' : 'oe'))
    .replace(/ü/gi, (m) => (m === m.toUpperCase() ? 'UE' : 'ue'));
}

/** Case/whitespace/diacritic/legal-suffix-insensitive, so "Magenta Telekom", "MAGENTA TELEKOM
 * (T-Mobile Austria GmbH)" and "T-Mobile Austria GmbH" all resolve to the same entry. */
export function normalizeCompanyName(name: string): string {
  return foldGerman(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[.,&/-]/g, ' ')
    .replace(/\b(gmbh|ag|se|kg|inc|ltd|plc|sa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** For matching what someone is still typing: like normalizeCompanyName, but it keeps legal-suffix
 * words (so typing "Sa" can still find "Samsung") and turns every punctuation mark into a space
 * (ASCII and Latin-1 punctuation and symbols, plus dashes, curly quotes and the rest of Unicode's
 * General Punctuation block). */
export function searchableName(name: string): string {
  return foldGerman(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[\u0000-/:-@[-`{-¿ -⁯]+/g, ' ')
    .trim();
}
