import crypto from 'node:crypto';

const SESSION_MS = 8 * 60 * 60 * 1000;
export const SUDO_MS = 10 * 60 * 1000;
const COOKIE = 'fft_admin';

const sha = (s) => crypto.createHash('sha256').update(s).digest();

/** Compares in constant time, whatever the lengths. */
export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
}

export function createAuth({ password, secret }) {
  const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

  /** { exp, sudo } -> cookie value. */
  const encode = (session) => {
    const body = Buffer.from(JSON.stringify(session)).toString('base64url');
    return `${body}.${sign(body)}`;
  };

  const decode = (value) => {
    const [body, mac] = String(value ?? '').split('.');
    if (!body || !mac) return null;
    const expected = sign(body);
    if (
      mac.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    )
      return null;
    try {
      const session = JSON.parse(Buffer.from(body, 'base64url').toString());
      return session.exp > Date.now() ? session : null;
    } catch {
      return null;
    }
  };

  const cookies = (req) =>
    Object.fromEntries(
      String(req.headers.cookie ?? '')
        .split(';')
        .map((c) => c.trim().split('='))
        .filter((p) => p.length === 2),
    );

  /** The session of a request, or null. `sudo` is how long (ms) sudo mode still lasts. */
  const sessionOf = (req) => {
    const s = decode(cookies(req)[COOKIE]);
    if (!s) return null;
    return { exp: s.exp, sudoUntil: s.sudo ?? 0 };
  };

  const setCookie = (res, req, session) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    const value = session ? encode({ exp: session.exp, sudo: session.sudoUntil }) : '';
    const age = session ? Math.floor((session.exp - Date.now()) / 1000) : 0;
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`,
    );
  };

  const newSession = () => ({ exp: Date.now() + SESSION_MS, sudoUntil: 0 });

  return { checkPassword: (given) => safeEqual(given, password), sessionOf, setCookie, newSession };
}

// ---------------------------------------------------------------- TOTP (RFC 6238)
// Second factor of the sign-in: a 6-digit code from an authenticator app, SHA-1, 30 s steps.

/** Base32 (RFC 4648, spaces and padding ignored) -> bytes. */
export function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = alphabet.indexOf(ch);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code of one 30-second step. */
export function totpCode(key, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/**
 * Checks codes against one secret: the current step and one on each side (phone clock drift).
 * A code that worked once is refused afterwards (no replay of a code seen over someone's shoulder).
 */
export function createTotp(secretBase32) {
  const key = base32Decode(secretBase32);
  if (key.length < 16) throw new Error('ADMIN_TOTP_SECRET needs 26+ base32 characters');
  let lastStep = -1;
  return {
    check(code, now = Date.now()) {
      const given = String(code ?? '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(given)) return false;
      const step = Math.floor(now / 30_000);
      for (const s of [step - 1, step, step + 1]) {
        if (s <= lastStep) continue;
        if (safeEqual(totpCode(key, s), given)) {
          lastStep = s;
          return true;
        }
      }
      return false;
    },
  };
}

/** Five wrong passwords from one address lock it out for 15 minutes. */
export function createLimiter({ max = 5, lockMs = 15 * 60 * 1000 } = {}) {
  const fails = new Map();
  return {
    locked(key) {
      const f = fails.get(key);
      return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
    },
    fail(key) {
      const f = fails.get(key) ?? { n: 0, until: 0 };
      f.n += 1;
      if (f.n >= max) {
        f.until = Date.now() + lockMs;
        f.n = 0;
      }
      fails.set(key, f);
    },
    ok(key) {
      fails.delete(key);
    },
  };
}
