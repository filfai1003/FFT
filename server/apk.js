// Publishing a new Android build on the install page (DECISIONS 75), for the GitHub workflow
// "Publish APK": it tells this server which EAS build to publish, and the server fetches the APK
// from EAS and puts it in the public `downloads` bucket with the key it already has. GitHub holds
// only APK_UPLOAD_TOKEN, which can do nothing but this; the server keeps its SHA-256
// (APK_UPLOAD_TOKEN_SHA256). Without that variable the endpoint does not exist.
import { createHash, timingSafeEqual } from 'node:crypto';

const BUCKET = 'downloads';
const MAX_BYTES = 300 * 1024 * 1024;
/** EAS build artifacts only: the server never fetches an address someone else chose. */
const ARTIFACT = /^https:\/\/expo\.dev\/artifacts\/eas\/[A-Za-z0-9_-]{8,80}\.apk$/;
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
    if (!BUILD_ID.test(buildId) || !ARTIFACT.test(buildUrl) || !VERSION.test(version))
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

    const apk = await fetch(buildUrl, { redirect: 'follow' });
    if (!apk.ok) return { status: 502, body: { error: `EAS answered ${apk.status}` } };
    if (Number(apk.headers.get('content-length') ?? 0) > MAX_BYTES)
      return { status: 413, body: { error: 'the APK is too large' } };
    const bytes = Buffer.from(await apk.arrayBuffer());
    if (bytes.length > MAX_BYTES) return { status: 413, body: { error: 'the APK is too large' } };
    // An APK is a zip: "PK\x03\x04".
    if (bytes.subarray(0, 4).toString('binary') !== 'PK\x03\x04')
      return { status: 422, body: { error: 'not an APK' } };

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
