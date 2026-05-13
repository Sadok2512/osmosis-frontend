# OSMOSIS Frontend — Vite/React build, served by nginx.
#
# Build:    docker build -t osmosis-frontend:7.1 -f qoebit-frontend/Dockerfile qoebit-frontend
# Run:      docker run -p 3000:80 osmosis-frontend:7.1

FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2: nginx serving the static build ──
FROM nginx:alpine

# Strip the default nginx site so it can't accidentally serve over ours.
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/osmosis.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
