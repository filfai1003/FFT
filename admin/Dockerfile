# Admin panel. Built from the repository root (Railway: dockerfilePath = admin/Dockerfile).
# (Admin panel: see docs/ADMIN.md.)
FROM node:24-slim
# pg_dump, the same major version as the server (17), for the backups.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev
COPY admin/server.js admin/auth.js admin/db.js ./
COPY admin/public ./public
CMD ["node", "server.js"]
