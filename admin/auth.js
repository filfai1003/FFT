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
