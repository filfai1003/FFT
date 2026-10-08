import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell('-3.5')).toBe('-3.5');
  });

  it('builds a table with a header', () => {
    const csv = toCsv([{ day: '2026-10-08', note: 'a,b', kg: 80 }], ['day', 'kg', 'note']);
    expect(csv).toBe('day,kg,note\r\n2026-10-08,80,"a,b"\r\n');
  });
});
