# ==============================================================================
# UberLite Backend Dockerfile
# Production-ready container image for Node.js + Express + Prisma + PostgreSQL
# ==============================================================================

FROM node:20-alpine

# Install openssl required for Prisma engine on Alpine Linux
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install all dependencies (including devDependencies required for Prisma and TypeScript)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and build config
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to dist/
RUN npm run build

# Copy container startup entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Environment settings
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
