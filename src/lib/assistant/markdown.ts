/*
 * A small, safe Markdown subset for the assistant's answers: paragraphs, headings, bold, italics,
 * inline code, fenced code, lists, simple tables and links. It parses to plain data that React
 * renders as text nodes (so any HTML in an answer shows as text, never as markup); links keep only
 * http(s) and mailto targets.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };

/** Fenced blocks of these languages get their own download button. */
export const DOWNLOADABLE_LANGS: Record<string, { ext: string; mime: string }> = {
  csv: { ext: 'csv', mime: 'text/csv' },
  tsv: { ext: 'tsv', mime: 'text/tab-separated-values' },
  json: { ext: 'json', mime: 'application/json' },
  md: { ext: 'md', mime: 'text/markdown' },
  markdown: { ext: 'md', mime: 'text/markdown' },
  txt: { ext: 'txt', mime: 'text/plain' },
};

/** The link target if it is a plain web or mail link, else null (the link then shows as text). */
export function safeHref(url: string): string | null {
  const href = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href)) return href;
  return null;
}

const INLINE =
  /`([^`\n]+)`|\*\*([^\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\s][^*\n]*?)\*|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev?.type === 'text') prev.text += text;
    else out.push({ type: 'text', text });
  };
  for (const m of src.matchAll(INLINE)) {
    const index = m.index ?? 0;
    pushText(src.slice(last, index));
    last = index + m[0].length;
    if (m[1] !== undefined) {
      out.push({ type: 'code', text: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: 'strong', children: parseInline(m[2]) });
    } else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      if (href) out.push({ type: 'link', href, children: parseInline(m[3]) });
      else pushText(m[3]);
    } else if (m[5] !== undefined) {
      out.push({ type: 'em', children: parseInline(m[5]) });
    } else if (m[6] !== undefined) {
      const href = safeHref(m[6]);
      if (href) out.push({ type: 'link', href, children: [{ type: 'text', text: m[6] }] });
      else pushText(m[6]);
    }
  }
  pushText(src.slice(last));
  return out;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;
const FENCE_OPEN = /^\s*```\s*([\w+-]*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line: string): Inline[][] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph.map(parseInline) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: 'code', lang: fence[1].toLowerCase(), text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 4), children: parseInline(heading[2]) });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flush();
      const header = splitRow(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = item[1] === undefined;
      const items = [item[3]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const nextItem = LIST_ITEM.exec(next);
        if (nextItem && (nextItem[1] === undefined) === ordered) {
          items.push(nextItem[3]);
          i++;
        } else if (!nextItem && /^\s{2,}\S/.test(next)) {
          items[items.length - 1] += ` ${next.trim()}`;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, start: ordered ? Number(item[2]) : 1, items: items.map(parseInline) });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}
