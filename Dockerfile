# Use Node.js 22 Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

ARG INCLUDE_DEV_DEPS=false

# Copy package files
COPY package*.json ./

# Install dependencies
RUN if [ "$INCLUDE_DEV_DEPS" = "true" ]; then \
      npm ci && npm cache clean --force; \
    else \
      npm ci --only=production && npm cache clean --force; \
    fi

# Copy source code
COPY . .

# Create logs directory and fix permissions for node_modules
RUN mkdir -p logs && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/node_modules/.bin

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
