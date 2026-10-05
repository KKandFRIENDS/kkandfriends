FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends cron util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY research-lab /app/research-lab
COPY lib/editorial-store.js /app/lib/editorial-store.js
COPY posts /app/posts
# Every Desk draft passes through the humanizer skill (stages.js humanizeDesk).
COPY .claude/skills/humanizer/SKILL.md /app/.claude/skills/humanizer/SKILL.md
COPY research-lab/deploy/desk.cron /etc/cron.d/kk-editorial
RUN chmod 0644 /etc/cron.d/kk-editorial && mkdir -p /state
CMD ["sh", "/app/research-lab/deploy/start.sh"]
