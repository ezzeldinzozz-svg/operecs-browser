# Operecs sync server (see README.md). node:sqlite is built into Node 22.13+.
FROM node:22-alpine
WORKDIR /app
# Built from the repository root (see docker-compose.yml) so the website comes along.
COPY sync-server/server.js .
COPY website ./website
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=8787 HOST=0.0.0.0 DATA=/data WEBSITE=/app/website
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/v1/health || exit 1
CMD ["node", "server.js"]
