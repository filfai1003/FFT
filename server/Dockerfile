# Built from the repository root (Railway: no root directory, dockerfilePath = server/Dockerfile).
# Deployed by Railway on every push to main that touches server/, supabase/migrations or supabase/functions.
FROM node:24-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.js server/migrate.js server/api.js ./
COPY supabase/functions ./fn
COPY supabase/migrations ./migrations
# The exercise catalogue, applied at every start (the service also redeploys when it changes).
COPY supabase/seed.sql ./seed.sql
# The Edge Functions are written for Deno ("npm:" imports): Node needs the plain package name.
RUN sed -i "s#npm:@supabase/supabase-js@2#@supabase/supabase-js#" fn/*/index.ts
CMD ["node", "index.js"]
