# Nightly backup (Railway cron service `backup`). Built from the repository root
# (dockerfilePath = backup/Dockerfile).
FROM node:24-slim
# pg_dump of the same major version as the server (17).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backup/package.json backup/package-lock.json ./
RUN npm ci --omit=dev
COPY backup/backup.mjs backup/restore.mjs ./
CMD ["node", "backup.mjs"]
