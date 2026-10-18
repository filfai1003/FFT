# Admin panel. Built from the repository root (Railway: dockerfilePath = admin/Dockerfile).
# No pg_dump: copies of the data are the nightly encrypted backups (backup/), not downloads.
FROM node:24-slim
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev
COPY admin/server.js admin/auth.js admin/db.js admin/privacy.js admin/roles.js ./
COPY admin/public ./public
CMD ["node", "server.js"]
