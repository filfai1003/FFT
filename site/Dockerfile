# The install page alone (Railway service `site`), until `web/Dockerfile` serves it too (DECISIONS
# 131): then the service and this file go. Built from the repository root.
FROM nginx:1.27-alpine
RUN sed -i "s/^worker_processes.*/worker_processes 1;/" /etc/nginx/nginx.conf
COPY site/nginx.conf /etc/nginx/templates/default.conf.template
COPY site/security-headers.conf /etc/nginx/snippets/site-security-headers.conf
COPY site /usr/share/nginx/site
RUN cd /usr/share/nginx/site && rm -f Dockerfile nginx.conf security-headers.conf
