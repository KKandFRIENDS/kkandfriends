FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends cron util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY research-lab /app/research-lab
COPY lib/editorial-store.js /app/lib/editorial-store.js
COPY posts /app/posts
COPY research-lab/deploy/desk.cron /etc/cron.d/kk-editorial
RUN chmod 0644 /etc/cron.d/kk-editorial && mkdir -p /state
CMD ["sh", "/app/research-lab/deploy/start.sh"]
