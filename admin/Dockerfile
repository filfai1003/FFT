# Admin panel. Built from the repository root (Railway: dockerfilePath = admin/Dockerfile).
# (Admin panel: see docs/ADMIN.md.)
FROM node:24-slim
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev
COPY admin/server.js admin/auth.js admin/db.js ./
COPY admin/public ./public
CMD ["node", "server.js"]
