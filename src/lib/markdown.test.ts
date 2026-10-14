import { parseInline, parseMarkdown } from './markdown';

describe('markdown from the AI', () => {
  it('bold, italic, code and links inside a line', () => {
    expect(
      parseInline('Eat **150 g** of *protein*, see `get_day` or [docs](https://x.dev).'),
    ).toEqual([
      { text: 'Eat ' },
      { text: '150 g', bold: true },
      { text: ' of ' },
      { text: 'protein', italic: true },
      { text: ', see ' },
      { text: 'get_day', code: true },
      { text: ' or ' },
      { text: 'docs', href: 'https://x.dev' },
      { text: '.' },
    ]);
  });

  it('italic inside bold, and stars or underscores inside words stay text', () => {
    expect(parseInline('**very *important***')).toEqual([
      { text: 'very ', bold: true },
      { text: 'important', bold: true, italic: true },
    ]);
    expect(parseInline('2*3*4 and snake_case_name')).toEqual([
      { text: '2*3*4 and snake_case_name' },
    ]);
  });

  it('headings, lists, quotes, rules, code blocks and paragraphs', () => {
    const blocks = parseMarkdown(
      [
        '## Your week',
        'You trained **3 times**.',
        'Good job.',
        '',
        '- Push A',
        '  - bench press',
        '2. Rest',
        '> Sleep more',
        '---',
        '```',
        'a = 1',
        '```',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'item',
      'item',
      'item',
      'quote',
      'rule',
      'code',
    ]);
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      inlines: [
        { text: 'You trained ' },
        { text: '3 times', bold: true },
        { text: '.\nGood job.' },
      ],
    });
    expect(blocks[3]).toMatchObject({ kind: 'item', depth: 1, marker: '•' });
    expect(blocks[4]).toMatchObject({ kind: 'item', ordered: true, marker: '2.' });
    expect(blocks[7]).toEqual({ kind: 'code', text: 'a = 1' });
  });

  it('tables', () => {
    const [table] = parseMarkdown('| Day | kcal |\n|---|---:|\n| Mon | **2100** |\n| Tue | 1900 |');
    expect(table).toEqual({
      kind: 'table',
      header: [[{ text: 'Day' }], [{ text: 'kcal' }]],
      rows: [
        [[{ text: 'Mon' }], [{ text: '2100', bold: true }]],
        [[{ text: 'Tue' }], [{ text: '1900' }]],
      ],
    });
  });
});
