// Publishing a new Android build on the install page (DECISIONS 76), for the GitHub workflow
// "Publish APK": it tells this server which EAS build to publish, and the server fetches the APK
// from EAS and puts it in the public `downloads` bucket with the key it already has. GitHub holds
// only APK_UPLOAD_TOKEN, which can do nothing but this; the server keeps its SHA-256
// (APK_UPLOAD_TOKEN_SHA256). Without that variable the endpoint does not exist.
import { createHash, timingSafeEqual } from 'node:crypto';

const BUCKET = 'downloads';
const MAX_BYTES = 300 * 1024 * 1024;
/**
 * EAS build artifacts only: the server never fetches an address someone else chose. Exactly
 * https://expo.dev/artifacts/eas/<id>.apk: no other host, port, user, query or fragment. This
 * cannot prove the build belongs to our EAS project (the address does not say): the token holder
 * is trusted to name one of ours (DECISIONS 86).
 */
const ARTIFACT = /^https:\/\/expo\.dev\/artifacts\/eas\/[A-Za-z0-9_-]{8,80}\.apk$/;
export const isArtifactUrl = (s) => {
  if (typeof s !== 'string' || !ARTIFACT.test(s)) return false;
  let u;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname === 'expo.dev' &&
    u.port === '' &&
    u.username === '' &&
    u.password === '' &&
    u.search === '' &&
    u.hash === '' &&
    u.href === s
  );
};

/**
 * An APK is a zip with an AndroidManifest.xml: local file header "PK\x03\x04" at the start, the
 * end of central directory record "PK\x05\x06" in the last 64 KB + 22 bytes, and the manifest's
 * name in the central directory (names are stored uncompressed). At most MAX_BYTES.
 */
export function looksLikeApk(bytes) {
  if (bytes.length < 22 || bytes.length > MAX_BYTES) return false;
  if (bytes.subarray(0, 4).toString('binary') !== 'PK\x03\x04') return false;
  const tail = bytes.subarray(Math.max(0, bytes.length - 65557));
  if (tail.lastIndexOf(Buffer.from('PK\x05\x06', 'binary')) < 0) return false;
  return bytes.includes(Buffer.from('AndroidManifest.xml'));
}

/** Reads a response body, giving up past `max` bytes (null), whatever content-length said. */
async function readCapped(res, max) {
  if (!res.body?.getReader) {
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > max ? null : b;
  }
  const reader = res.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => null);
      return null;
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}
const BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * `tokenSha256`: hex SHA-256 of the upload token (unset = endpoint off). `supabaseUrl` and
 * `serviceKey`: the storage service. `fetch` can be replaced in tests.
 * Returns handle({ headers, body }) -> { status, body }.
 */
export function createApkPublisher({
  tokenSha256,
  supabaseUrl,
  serviceKey,
  fetch = globalThis.fetch,
}) {
  const expected = String(tokenSha256 ?? '')
    .trim()
    .toLowerCase();
  const enabled = /^[0-9a-f]{64}$/.test(expected);
  const storage = (p, init = {}) =>
    fetch(`${supabaseUrl}/storage/v1/${p}`, {
      ...init,
      headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, ...init.headers },
    });

  const authorized = (headers) => {
    const m = /^Bearer (\S+)$/.exec(String(headers?.authorization ?? ''));
    if (!m) return false;
    const a = Buffer.from(sha256(m[1]));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  async function upload(name, body, contentType, cacheSeconds) {
    const res = await storage(`object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-upsert': 'true',
        'cache-control': `max-age=${cacheSeconds}`,
      },
      body,
    });
    if (!res.ok) throw new Error(`upload of ${name} failed: ${res.status}`);
  }

  return async function handle({ headers, body }) {
    if (!enabled) return { status: 404, body: { error: 'not found' } };
    if (!authorized(headers)) return { status: 401, body: { error: 'wrong token' } };
    const buildId = String(body?.build_id ?? '');
    const buildUrl = String(body?.build_url ?? '');
    const version = String(body?.version ?? '');
    if (!BUILD_ID.test(buildId) || !isArtifactUrl(buildUrl) || !VERSION.test(version))
      return {
        status: 400,
        body: {
          error: 'build_id (uuid), build_url (an EAS .apk artifact) and version (x.y.z) are needed',
        },
      };

    // Already on the page: nothing to do (the workflow runs every 3 hours).
    const current = await fetch(
      `${supabaseUrl}/storage/v1/object/public/${BUCKET}/config.js`,
    ).catch(() => null);
    if (current?.ok && (await current.text()).includes(buildId))
      return { status: 200, body: { published: false, reason: 'already published' } };

    // EAS answers with a redirect to its file storage: followed, but only to https.
    const apk = await fetch(buildUrl, { redirect: 'follow' });
    if (!apk.ok) return { status: 502, body: { error: `EAS answered ${apk.status}` } };
    if (apk.url && !String(apk.url).startsWith('https://'))
      return { status: 502, body: { error: 'EAS redirected to a non-https address' } };
    if (Number(apk.headers.get('content-length') ?? 0) > MAX_BYTES)
      return { status: 413, body: { error: 'the APK is too large' } };
    const bytes = await readCapped(apk, MAX_BYTES);
    if (!bytes) return { status: 413, body: { error: 'the APK is too large' } };
    if (!looksLikeApk(bytes)) return { status: 422, body: { error: 'not an APK' } };

    // The bucket exists after the first publish; made here otherwise (public, 300 MB files).
    await storage('bucket', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES }),
    }).catch(() => null);

    await upload('fft.apk', bytes, 'application/vnd.android.package-archive', 300);
    const size = `${Math.round(bytes.length / 1024 / 1024)} MB`;
    // The install page serves both files from its own address (see site/nginx.conf).
    const config = `window.FFT_APK = ${JSON.stringify({ url: '/fft.apk', version, size, build: buildId })};\n`;
    await upload('config.js', config, 'application/javascript', 60);
    return { status: 200, body: { published: true, size } };
  };
}
