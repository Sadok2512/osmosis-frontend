# OSMOSIS Frontend — Vite/React build, served by nginx.
#
# Build:    docker build -t osmosis-frontend:8.5 -f qoebit-frontend/Dockerfile qoebit-frontend
# Run:      docker run -p 3000:80 osmosis-frontend:8.5

FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
# --legacy-peer-deps: react-leaflet@4 uses @react-leaflet/core@^2 while
# react-leaflet-cluster@4 wants ^3. The lockfile already pins compatible
# versions, npm 7+ just refuses without the override.
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: nginx serving the static build ──
FROM nginx:alpine

# Strip the default nginx site so it can't accidentally serve over ours.
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

COPY --from=build /app/dist /usr/share/nginx/html
# Template — envsubst expands ${VARS} at container start.
COPY nginx.docker.conf /etc/nginx/templates/osmosis.conf.template

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${NGINX_PORT:-3000}/ >/dev/null 2>&1 || exit 1

# nginx:alpine ships with envsubst + entrypoint /docker-entrypoint.sh
# that auto-runs `envsubst` over /etc/nginx/templates/*.template into
# /etc/nginx/conf.d/. Defaults below match the host-network mono setup.
ENV NGINX_PORT=3000 \
    PARSER_HOST=127.0.0.1   PARSER_PORT=8000 \
    KPI_HOST=127.0.0.1      KPI_PORT=8001    \
    ML_HOST=127.0.0.1       ML_PORT=11002    \
    AGENT_HOST=127.0.0.1    AGENT_PORT=11000 \
    AGENTIC_HOST=127.0.0.1  AGENTIC_PORT=11003

CMD ["nginx", "-g", "daemon off;"]
