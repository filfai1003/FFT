// Makes a new JWT secret and the anon and service-role keys signed with it, for rotating them on
// the hosted backend (docs/DEPLOY.md → Rotating the keys). Prints nothing secret: it writes a file
// in .secrets/ (git-ignored) listing, service by service, which Railway variable gets which value.
//   node supabase/scripts/rotate-jwt.mjs
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const b64url = (s) => Buffer.from(s).toString('base64url');
const sign = (payload, secret) => {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${mac}`;
};

const secret = randomBytes(48).toString('base64url'); // 64 characters
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;
const anon = sign({ role: 'anon', iss: 'supabase', iat, exp }, secret);
const service = sign({ role: 'service_role', iss: 'supabase', iat, exp }, secret);

const day = new Date().toISOString().slice(0, 10);
const file = join('.secrets', `rotation-${day}.txt`);
mkdirSync('.secrets', { recursive: true });
writeFileSync(
  file,
  `New keys made ${new Date().toISOString()}. Copy each value into Railway (project fft → service →
Variables → edit the variable → paste → save), then follow docs/DEPLOY.md → Rotating the keys.
Delete this file when done (the values stay in Railway).

JWT_SECRET (private):
${secret}

ANON_KEY (public by design):
${anon}

SERVICE_ROLE_KEY (private):
${service}

Where each one goes:
  auth     GOTRUE_JWT_SECRET               = JWT_SECRET
  rest     PGRST_JWT_SECRET                = JWT_SECRET
  rest     PGRST_APP_SETTINGS_JWT_SECRET   = JWT_SECRET
  storage  PGRST_JWT_SECRET                = JWT_SECRET
  storage  ANON_KEY                        = ANON_KEY
  storage  SERVICE_KEY                     = SERVICE_ROLE_KEY
  backend  ANON_KEY                        = ANON_KEY
  backend  SERVICE_ROLE_KEY                = SERVICE_ROLE_KEY
  backend  KONG_DECLARATIVE_CONFIG_STRING  = only if it contains the old keys written out
                                             (if it says \${{ANON_KEY}} / \${{SERVICE_ROLE_KEY}}, leave it)
  api      SUPABASE_SERVICE_ROLE_KEY       = SERVICE_ROLE_KEY
  backup   SUPABASE_SERVICE_ROLE_KEY       = leave it if it is \${{api.SUPABASE_SERVICE_ROLE_KEY}}
  web      EXPO_PUBLIC_SUPABASE_ANON_KEY   = ANON_KEY
  EAS      EXPO_PUBLIC_SUPABASE_ANON_KEY   = ANON_KEY (Claude can set this one: it is public)
`,
);
console.log(`Written to ${file} (nothing secret printed).`);
