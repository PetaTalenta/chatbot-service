const logger = require('../utils/logger');

// Simple in-memory metrics store
const metrics = {
  requests: {
    total: 0,
    byMethod: {},
    byPath: {},
    byStatus: {}
  },
  conversations: {
    created: 0,
    updated: 0,
    deleted: 0
  },
  messages: {
    sent: 0,
    received: 0
  },
  errors: {
    total: 0,
    byType: {}
  },
  responseTime: {
    total: 0,
    count: 0,
    average: 0,
    min: Infinity,
    max: 0
  }
};

/**
 * Middleware to collect HTTP metrics
 */
const collectHttpMetrics = (req, res, next) => {
  const startTime = Date.now();

  // Increment request counter
  metrics.requests.total++;
  
  // Track by method
  const method = req.method;
  metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;
  
  // Track by path (simplified)
  const path = req.route?.path || req.path;
  metrics.requests.byPath[path] = (metrics.requests.byPath[path] || 0) + 1;

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    // Track response time
    metrics.responseTime.total += duration;
    metrics.responseTime.count++;
    metrics.responseTime.average = metrics.responseTime.total / metrics.responseTime.count;
    metrics.responseTime.min = Math.min(metrics.responseTime.min, duration);
    metrics.responseTime.max = Math.max(metrics.responseTime.max, duration);
    
    // Track by status code
    const status = res.statusCode;
    metrics.requests.byStatus[status] = (metrics.requests.byStatus[status] || 0) + 1;
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        statusCode: status,
        userId: req.user?.id,
        requestId: req.id
      });
    }
    
    // Track errors
    if (status >= 400) {
      metrics.errors.total++;
      const errorType = status >= 500 ? 'server_error' : 'client_error';
      metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
    }
    
    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Increment conversation metrics
 */
const incrementConversationMetric = (action) => {
  if (metrics.conversations[action] !== undefined) {
    metrics.conversations[action]++;
  }
};

/**
 * Increment message metrics
 */
const incrementMessageMetric = (action) => {
  if (metrics.messages[action] !== undefined) {
    metrics.messages[action]++;
  }
};

/**
 * Get current metrics
 */
const getMetrics = () => {
  return {
    ...metrics,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
  metrics.requests.total = 0;
  metrics.requests.byMethod = {};
  metrics.requests.byPath = {};
  metrics.requests.byStatus = {};
  metrics.conversations.created = 0;
  metrics.conversations.updated = 0;
  metrics.conversations.deleted = 0;
  metrics.messages.sent = 0;
  metrics.messages.received = 0;
  metrics.errors.total = 0;
  metrics.errors.byType = {};
  metrics.responseTime.total = 0;
  metrics.responseTime.count = 0;
  metrics.responseTime.average = 0;
  metrics.responseTime.min = Infinity;
  metrics.responseTime.max = 0;
};

/**
 * Log metrics summary periodically
 */
const startMetricsLogging = () => {
  setInterval(() => {
    const currentMetrics = getMetrics();
    logger.info('Metrics summary', {
      requests: currentMetrics.requests.total,
      conversations: currentMetrics.conversations,
      messages: currentMetrics.messages,
      errors: currentMetrics.errors.total,
      avgResponseTime: `${currentMetrics.responseTime.average.toFixed(2)}ms`,
      uptime: `${currentMetrics.uptime.toFixed(2)}s`,
      memoryUsage: {
        rss: `${(currentMetrics.memory.rss / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(currentMetrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`
      }
    });
  }, 5 * 60 * 1000); // Log every 5 minutes
};

module.exports = {
  collectHttpMetrics,
  incrementConversationMetric,
  incrementMessageMetric,
  getMetrics,
  resetMetrics,
  startMetricsLogging
};
