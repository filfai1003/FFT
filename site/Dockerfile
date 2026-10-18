# Static install page. Built from the repository root (Railway: dockerfilePath = site/Dockerfile).
FROM nginx:1.27-alpine
COPY site/nginx.conf /etc/nginx/templates/default.conf.template
COPY site/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY site /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/security-headers.conf
