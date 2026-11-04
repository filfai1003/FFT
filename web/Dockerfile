# The web version of the app (premium accounts) and the install page, one nginx for both (DECISIONS
# 131). Built from the repository root (Railway service `web`: dockerfilePath = web/Dockerfile).
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
# The backend address the install page reads the APK from: the same one the web app was built with.
ARG EXPO_PUBLIC_SUPABASE_URL
ENV BACKEND_URL=$EXPO_PUBLIC_SUPABASE_URL
# One worker: `auto` starts one per host core (~48 on Railway), for pages that are nearly idle.
RUN sed -i "s/^worker_processes.*/worker_processes 1;/" /etc/nginx/nginx.conf
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
COPY web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY site/nginx.conf /etc/nginx/templates/site.conf.template
COPY site/security-headers.conf /etc/nginx/snippets/site-security-headers.conf
COPY site /usr/share/nginx/site
RUN cd /usr/share/nginx/site && rm -f Dockerfile nginx.conf security-headers.conf
