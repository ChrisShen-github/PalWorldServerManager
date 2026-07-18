FROM node:22-alpine AS web-build
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends nginx supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /var/lib/palworld-manager /run/nginx \
    && chown -R appuser:appuser /app /var/lib/palworld-manager
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY infra/container/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/container/supervisord.conf /etc/supervisor/conf.d/manager.conf
COPY --from=web-build /web/dist /usr/share/nginx/html
COPY host-agent/ /usr/share/palworld-server-manager/host-agent/
COPY infra/container/manager-entrypoint.sh /usr/local/bin/manager-entrypoint
RUN chmod 0755 /usr/share/palworld-server-manager/host-agent/install.sh /usr/local/bin/manager-entrypoint
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/manager-entrypoint"]
CMD ["/usr/bin/supervisord", "-n"]
