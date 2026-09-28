FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends cron util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ops/briefs/package.json ops/briefs/package-lock.json ./
RUN npm ci --omit=dev
COPY lib/briefs /app/lib/briefs
COPY lib/market-sources.js lib/ecos.js lib/community-internal.js /app/lib/
COPY ops/briefs/run.mjs ops/briefs/save-env.mjs ops/briefs/start.sh /app/ops/briefs/
COPY ops/briefs/briefs.cron /etc/cron.d/kk-briefs
RUN chmod 0644 /etc/cron.d/kk-briefs && mkdir -p /state
CMD ["sh", "/app/ops/briefs/start.sh"]
