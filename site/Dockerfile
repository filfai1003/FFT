# Static install page. Built from the repository root (Railway: dockerfilePath = site/Dockerfile).
FROM nginx:1.27-alpine
COPY site/nginx.conf /etc/nginx/templates/default.conf.template
COPY site /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf
