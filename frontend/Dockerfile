## Frontend Dockerfile — build React app (Vite) and serve with nginx

FROM node:18-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefix ./
COPY frontend/ ./
RUN npm run build --prefix ./

FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod -R a-w /usr/share/nginx/html

# Optional: include a simple nginx config if needed (default is fine for static SPA)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
