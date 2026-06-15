FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Feature flags (default off → production hides WC2026; staging passes =true)
ARG VITE_WC2026_ENABLED=false
ENV VITE_WC2026_ENABLED=$VITE_WC2026_ENABLED
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY docker-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
