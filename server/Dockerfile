# Built from the repository root (Railway: no root directory, dockerfilePath = server/Dockerfile).
# Deployed by Railway on every push to main that touches server/, src/domain, supabase/migrations
# or supabase/functions.
FROM node:24-slim
# The server lives in /app/server; the app's pure rules (src/domain, TypeScript, run as they are
# by Node) next to it in /app/src/domain, where ../src/domain from the server finds them.
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.js server/migrate.js server/api.js server/coach.js server/oauth.js server/ts-resolve.mjs ./
COPY src/domain /app/src/domain
RUN echo '{"type":"module"}' > /app/src/package.json
COPY supabase/functions ./fn
COPY supabase/migrations ./migrations
# The exercise catalogue, applied at every start (the service also redeploys when it changes).
COPY supabase/seed.sql ./seed.sql
# The Edge Functions are written for Deno ("npm:" imports): Node needs the plain package name.
RUN sed -i "s#npm:@supabase/supabase-js@2#@supabase/supabase-js#" fn/*/index.ts
CMD ["node", "--import", "./ts-resolve.mjs", "index.js"]
