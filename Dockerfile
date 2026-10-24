FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ENV NODE_ENV=production PORT=8080
WORKDIR /opt/portfolio
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
COPY public ./public
RUN chmod -R a+rX /opt/portfolio
USER 1001
EXPOSE 8080
CMD ["node", "src/server.js"]
