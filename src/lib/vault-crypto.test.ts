import {
  calibrateKdf,
  createVault,
  formatSecretCode,
  hiddenName,
  open,
  openFile,
  openRow,
  parseSecretCode,
  randomBytes,
  rewrapWithPassphrase,
  seal,
  sealFile,
  sealRow,
  unlockWithPassphrase,
  unlockWithRecovery,
  WrongSecretError,
  type KdfParams,
} from './vault-crypto';

// Small parameters keep the tests fast; the app calibrates real ones (at least 2^14).
const FAST: KdfParams = { alg: 'scrypt', N: 2 ** 10, r: 8, p: 1 };

describe('vault crypto (DECISIONS 64)', () => {
  it('a row goes round trip; another key, table or id cannot open it', () => {
    const key = randomBytes(32);
    const row = { id: 'a', day: '2026-10-17', ml: 250, note: 'ü€' };
    const box = sealRow(key, 'water_logs', 'a', row);
    expect(box).not.toContain('250');
    expect(openRow(key, 'water_logs', 'a', box)).toEqual(row);
    expect(() => openRow(randomBytes(32), 'water_logs', 'a', box)).toThrow();
    expect(() => openRow(key, 'food_logs', 'a', box)).toThrow();
    expect(() => openRow(key, 'water_logs', 'b', box)).toThrow();
  });

  it('the same row sealed twice looks different (random nonce)', () => {
    const key = randomBytes(32);
    expect(sealRow(key, 't', '1', { a: 1 })).not.toBe(sealRow(key, 't', '1', { a: 1 }));
  });

  it('a changed byte is refused', () => {
    const key = randomBytes(32);
    const box = seal(key, new Uint8Array([1, 2, 3]), 'x');
    box[box.length - 1] ^= 1;
    expect(() => open(key, box, 'x')).toThrow();
  });

  it('a photo goes round trip under its own name only', () => {
    const key = randomBytes(32);
    const bytes = randomBytes(5000);
    const box = sealFile(key, 'progress-photos/u/p.jpg', bytes);
    expect(openFile(key, 'progress-photos/u/p.jpg', box)).toEqual(bytes);
    expect(() => openFile(key, 'progress-photos/u/q.jpg', box)).toThrow();
    expect(hiddenName(key, 'progress-photos/u/p.jpg')).toMatch(/^[0-9a-f]{32}$/);
    expect(hiddenName(key, 'progress-photos/u/p.jpg')).toBe(
      hiddenName(key, 'progress-photos/u/p.jpg'),
    );
  });

  it('recovery codes: 32 characters in 8 groups, read back loosely, wrong ones refused', () => {
    const bytes = randomBytes(20);
    const code = formatSecretCode(bytes);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(parseSecretCode(code)).toEqual(bytes);
    expect(parseSecretCode(` ${code.toLowerCase().replace(/-/g, ' ')} `)).toEqual(bytes);
    expect(parseSecretCode(code.slice(0, -1))).toBeNull();
    expect(parseSecretCode(code.replace(/.$/, 'U'))).toBeNull();
  });

  it('the passphrase and the recovery key open the vault; wrong ones do not', async () => {
    const { dataKey, recoveryCode, record } = await createVault('correct horse battery', FAST);
    expect(JSON.stringify(record)).not.toContain('correct horse');
    expect(await unlockWithPassphrase(record, 'correct horse battery')).toEqual(dataKey);
    expect(unlockWithRecovery(record, recoveryCode)).toEqual(dataKey);
    await expect(unlockWithPassphrase(record, 'correct horse batterY')).rejects.toBeInstanceOf(
      WrongSecretError,
    );
    const other = formatSecretCode(randomBytes(20));
    expect(() => unlockWithRecovery(record, other)).toThrow(WrongSecretError);
    expect(() => unlockWithRecovery(record, 'not a code')).toThrow(WrongSecretError);
  });

  it('a new passphrase re-wraps the same key; the old one stops working, the recovery key still works', async () => {
    const { dataKey, recoveryCode, record } = await createVault('first passphrase', FAST);
    const next = await rewrapWithPassphrase(record, dataKey, 'second passphrase');
    expect(next.salt).not.toBe(record.salt);
    expect(await unlockWithPassphrase(next, 'second passphrase')).toEqual(dataKey);
    await expect(unlockWithPassphrase(next, 'first passphrase')).rejects.toBeInstanceOf(
      WrongSecretError,
    );
    expect(unlockWithRecovery(next, recoveryCode)).toEqual(dataKey);
  });

  it('calibration picks between 2^14 and 2^16 from the time a small run takes', async () => {
    let t = 0;
    const clock = (step: number) => () => (t += step);
    expect((await calibrateKdf(1500, clock(10))).N).toBe(2 ** 16); // 10 ms a probe: 160 ms
    expect((await calibrateKdf(1500, clock(150))).N).toBe(2 ** 15); // 1.2 s
    expect((await calibrateKdf(1500, clock(200))).N).toBe(2 ** 14);
    expect((await calibrateKdf(1500, clock(900))).N).toBe(2 ** 14); // slow device: the minimum
  });
});
