# Stage 1: Build the Vite + Three.js WebXR application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve static bundle & USDZ/GLB assets with Nginx on port 8080
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["/bin/sh", "-c", "printf 'window.__RUNTIME_CONFIG__ = { GEMINI_API_KEY: \"%s\" };\\n' \"${GEMINI_API_KEY:-}\" > /usr/share/nginx/html/runtime-config.js && exec nginx -g 'daemon off;'"]
