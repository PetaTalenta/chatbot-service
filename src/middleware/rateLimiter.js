const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Create rate limiter for conversations
 */
const conversationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: parseInt(process.env.RATE_LIMIT_CONVERSATIONS_PER_DAY || '100'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Daily conversation limit exceeded. Please try again tomorrow.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Conversation rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Daily conversation limit exceeded. Please try again tomorrow.',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      }
    });
  },
  skip: (req) => {
    // Skip rate limiting for internal service requests
    return req.headers['x-internal-service'] === 'true';
  }
});

/**
 * Create rate limiter for messages
 */
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many messages. Please slow down.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Message rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many messages. Please slow down.',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      }
    });
  },
  skip: (req) => {
    return req.headers['x-internal-service'] === 'true';
  }
});

/**
 * Create rate limiter specifically for free model usage
 * More restrictive to respect OpenRouter free model limits
 */
const freeModelLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.FREE_MODEL_RATE_LIMIT_PER_MINUTE || '20'), // 20 requests per minute for free models
  message: {
    success: false,
    error: {
      code: 'FREE_MODEL_RATE_LIMIT_EXCEEDED',
      message: 'Free model rate limit exceeded. Please wait before sending another message.',
      retryAfter: '1 minute'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID for authenticated requests, IP for anonymous
    return `free_model_${req.user?.id || req.ip}`;
  },
  handler: (req, res) => {
    logger.warn('Free model rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      conversationId: req.params.conversationId,
      requestId: req.id
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'FREE_MODEL_RATE_LIMIT_EXCEEDED',
        message: 'Free model rate limit exceeded. Please wait before sending another message.',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      }
    });
  },
  skip: (req) => {
    // Skip rate limiting for internal service requests
    return req.headers['x-internal-service'] === 'true';
  }
});

/**
 * Create general API rate limiter
 * Reduced to 200 requests per 15 minutes for better resource management
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('API rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      requestId: req.id
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      }
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks and internal services
    return req.path.startsWith('/health') ||
           req.headers['x-internal-service'] === 'true';
  }
});

module.exports = {
  conversationLimiter,
  messageLimiter,
  freeModelLimiter,
  apiLimiter
};
