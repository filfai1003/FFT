import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  it.each(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'ü€ 🙂'])('%j like Node', (s) => {
    const bytes = new TextEncoder().encode(s);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it.each(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'ü€ 🙂'])('%j back to bytes', (s) => {
    const bytes = new TextEncoder().encode(s);
    expect(Buffer.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Buffer.from(bytes));
  });

  it('refuses characters outside the alphabet', () => {
    expect(() => base64ToBytes('ab$d')).toThrow();
  });
});
