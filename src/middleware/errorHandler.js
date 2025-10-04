const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id
  });

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let errorMessage = 'An internal server error occurred';

  // Handle specific error types
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Database validation failed';
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    errorCode = 'DUPLICATE_ERROR';
    errorMessage = 'Resource already exists';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    errorCode = 'REFERENCE_ERROR';
    errorMessage = 'Referenced resource not found';
  } else if (err.name === 'SequelizeConnectionError') {
    statusCode = 503;
    errorCode = 'DATABASE_ERROR';
    errorMessage = 'Database connection failed';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    errorMessage = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    errorMessage = 'Token has expired';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.details ? err.details[0].message : 'Validation failed';
  } else if (err.message) {
    // Handle chatbot-specific errors
    if (err.message.includes('Conversation not found')) {
      statusCode = 404;
      errorCode = 'CONVERSATION_NOT_FOUND';
      errorMessage = 'Conversation not found';
    } else if (err.message.includes('Message not found')) {
      statusCode = 404;
      errorCode = 'MESSAGE_NOT_FOUND';
      errorMessage = 'Message not found';
    } else if (err.message.includes('Unauthorized access')) {
      statusCode = 403;
      errorCode = 'UNAUTHORIZED_ACCESS';
      errorMessage = 'Unauthorized access to resource';
    } else if (err.message.includes('Rate limit exceeded')) {
      statusCode = 429;
      errorCode = 'RATE_LIMIT_EXCEEDED';
      errorMessage = 'Rate limit exceeded';
    } else if (err.message.includes('Message too long')) {
      statusCode = 400;
      errorCode = 'MESSAGE_TOO_LONG';
      errorMessage = 'Message exceeds maximum length';
    }
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err.message 
      })
    }
  });
};

module.exports = errorHandler;
