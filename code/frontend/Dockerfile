# ==============================================================================
# UberLite Frontend Dockerfile
# Production-ready multi-stage container build for React + Vite + Nginx
# ==============================================================================

# Stage 1: Build static distribution
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Copy dependency specifications
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and build files
COPY index.html tsconfig*.json vite.config.ts ./
COPY public ./public/
COPY src ./src/

# Build production assets to dist/
RUN npm run build

# Stage 2: Serve with lightweight Nginx web server
FROM nginx:alpine AS runner

# Remove default nginx html files
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
