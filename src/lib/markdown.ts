/**
 * The bit of Markdown AI models write (**bold**, *italic*, `code`, headings, lists, quotes, code
 * blocks, tables, links), parsed into blocks the app draws with its own Text: no HTML, no web view.
 */

export type Inline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'item'; ordered: boolean; marker: string; depth: number; inlines: Inline[] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

// `code`, **bold** / __bold__, *italic* / _italic_ (not inside words), [text](url)
const INLINE =
  /(`[^`\n]+`)|(\*\*(?=\S)[^\n]*?\S\*\*(?!\*)|__(?=\S)[^\n]*?\S__(?!_))|((?<![\w*])\*[^*\s](?:[^*\n]*?[^*\s])?\*(?![\w*])|(?<![\w_])_[^_\s](?:[^_\n]*?[^_\s])?_(?![\w_]))|(\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(text: string, base: Omit<Inline, 'text'> = {}): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ ...base, text: text.slice(last, at) });
    const [token, code, bold, italic, link] = m;
    if (code) out.push({ ...base, code: true, text: code.slice(1, -1) });
    else if (bold) out.push(...parseInline(bold.slice(2, -2), { ...base, bold: true }));
    else if (italic) out.push(...parseInline(italic.slice(1, -1), { ...base, italic: true }));
    else if (link) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(link)!;
      out.push({ ...base, text: parts[1], href: parts[2] });
    }
    last = at + token.length;
  }
  if (last < text.length) out.push({ ...base, text: text.slice(last) });
  return out.filter((i) => i.text !== '');
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (trimmed === '') {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        kind: 'heading',
        level,
        inlines: parseInline(heading[2].replace(/\s*#+$/, '')),
      });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    // A table: a row of cells followed by a |---|---| line.
    if (
      trimmed.includes('|') &&
      /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1]?.trim() ?? '')
    ) {
      flush();
      const header = cells(trimmed);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim().includes('|'); i++)
        rows.push(cells(lines[i]));
      i--;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    const item = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      blocks.push({
        kind: 'item',
        ordered,
        marker: ordered ? item[2].replace(')', '.') : '•',
        depth: Math.min(Math.floor(item[1].replace(/\t/g, '  ').length / 2), 3),
        inlines: parseInline(item[3]),
      });
      continue;
    }
    if (trimmed.startsWith('>')) {
      flush();
      blocks.push({ kind: 'quote', inlines: parseInline(trimmed.replace(/^>\s?/, '')) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}
