# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN NODE_OPTIONS="--max-old-space-size=3072" npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pm2
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY ecosystem.config.cjs ./
EXPOSE 5003
CMD ["pm2-runtime", "ecosystem.config.cjs"]