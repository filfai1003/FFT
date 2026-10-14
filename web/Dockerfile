# The web version of the app (premium accounts), built from the repository root
# (Railway service `web`: dockerfilePath = web/Dockerfile). Redeploys on every push to main.
# EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are service variables, passed to the
# build (they are baked into the JavaScript, like in the phone app; the anon key is public).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" && test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY"
RUN npx expo export -p web --output-dir dist

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
