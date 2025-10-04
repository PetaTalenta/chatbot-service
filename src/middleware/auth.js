const logger = require('../utils/logger');
const unifiedAuthService = require('../services/unifiedAuthService');

/**
 * Unified authentication middleware
 * Supports both JWT (legacy) and Firebase tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Check if user info is provided by API Gateway via headers
    if (req.headers['x-user-id']) {
      req.user = {
        id: req.headers['x-user-id'],
        email: req.headers['x-user-email'] || 'unknown',
        user_type: req.headers['x-user-type'] || 'user'
      };

      logger.info('User authenticated via API Gateway headers', {
        userId: req.user.id,
        userEmail: req.user.email,
        url: req.originalUrl
      });

      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    logger.info('Authentication attempt', {
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      url: req.originalUrl,
      headers: Object.keys(req.headers)
    });

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        requestId: req.id,
        authHeader: authHeader
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required'
        }
      });
    }

    // Verify token (supports both JWT and Firebase)
    const user = await unifiedAuthService.verifyToken(token);

    if (!user || !user.id) {
      logger.warn('Authentication failed: Invalid token', {
        ip: req.ip,
        requestId: req.id,
        url: req.originalUrl
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token'
        }
      });
    }

    // Attach user information to request
    req.user = {
      id: user.id,
      email: user.email,
      user_type: user.user_type || 'user',
      username: user.username,
      auth_provider: user.auth_provider,
      tokenType: user.tokenType
    };
    req.token = token;

    logger.info('User authenticated successfully', {
      userId: req.user.id,
      userEmail: req.user.email,
      tokenType: user.tokenType,
      authProvider: user.auth_provider,
      url: req.originalUrl,
      requestId: req.id
    });

    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      requestId: req.id
    });

    let statusCode = 401;
    let errorCode = 'UNAUTHORIZED';
    let errorMessage = 'Authentication failed';

    if (error.message && error.message.includes('expired')) {
      errorCode = 'TOKEN_EXPIRED';
      errorMessage = 'Token has expired';
    } else if (error.message === 'Invalid token format') {
      errorCode = 'INVALID_TOKEN';
      errorMessage = 'Invalid token format';
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    });
  }
};

/**
 * Middleware to authenticate internal service requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateInternalService = (req, res, next) => {
  try {
    const internalServiceHeader = req.headers['x-internal-service'];
    const serviceKey = req.headers['x-service-key'];

    if (!internalServiceHeader || internalServiceHeader !== 'true') {
      logger.warn('Internal service authentication failed: Missing internal service header', {
        ip: req.ip,
        url: req.originalUrl,
        requestId: req.id
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Internal service access required'
        }
      });
    }

    if (!serviceKey || serviceKey !== process.env.INTERNAL_SERVICE_KEY) {
      logger.warn('Internal service authentication failed: Invalid service key', {
        ip: req.ip,
        url: req.originalUrl,
        requestId: req.id
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid service key'
        }
      });
    }

    logger.debug('Internal service authenticated successfully', {
      ip: req.ip,
      url: req.originalUrl,
      requestId: req.id
    });

    next();
  } catch (error) {
    logger.error('Internal service authentication error', {
      error: error.message,
      ip: req.ip,
      url: req.originalUrl,
      requestId: req.id
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal service authentication failed'
      }
    });
  }
};

/**
 * Middleware to set user context for RLS
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const setUserContext = async (req, res, next) => {
  if (req.user && req.user.id) {
    try {
      const { sequelize } = require('../models');
      await sequelize.query(`SET app.current_user_id = '${req.user.id}'`);
      logger.debug('User context set for RLS', {
        userId: req.user.id,
        requestId: req.id
      });
    } catch (error) {
      logger.warn('Failed to set user context for RLS', {
        error: error.message,
        userId: req.user.id,
        requestId: req.id
      });
    }
  }
  next();
};

module.exports = {
  authenticateToken,
  authenticateInternalService,
  setUserContext
};
