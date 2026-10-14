import { bytesToBase64 } from './base64';

describe('base64', () => {
  it.each(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'ü€ 🙂'])('%j like Node', (s) => {
    const bytes = new TextEncoder().encode(s);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
