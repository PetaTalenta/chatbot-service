const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validate request body against schema
 * @param {Object} schema - Joi schema
 * @returns {Function} Express middleware
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => detail.message);
      
      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        requestId: req.id
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errorDetails
        }
      });
    }

    // Replace request body with validated value
    req.body = value;
    next();
  };
};

/**
 * Validate request query parameters against schema
 * @param {Object} schema - Joi schema
 * @returns {Function} Express middleware
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => detail.message);
      
      logger.warn('Query validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        requestId: req.id
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query validation failed',
          details: errorDetails
        }
      });
    }

    // Replace request query with validated value
    req.query = value;
    next();
  };
};

/**
 * Validate request URL parameters against schema
 * @param {Object} schema - Joi schema
 * @returns {Function} Express middleware
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => detail.message);

      logger.warn('Params validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        requestId: req.id
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL parameters validation failed',
          details: errorDetails
        }
      });
    }

    // Replace request params with validated value
    req.params = value;
    next();
  };
};

// Validation schemas
const schemas = {
  // Create conversation schema
  createConversation: Joi.object({
    title: Joi.string().max(255).optional()
      .messages({
        'string.max': 'Title must be at most 255 characters long'
      }),
    profilePersona: Joi.object().optional()
      .messages({
        'object.base': 'Profile persona must be a valid object'
      }),
    resultsId: Joi.string().uuid().optional()
      .messages({
        'string.guid': 'Results ID must be a valid UUID'
      }),
    metadata: Joi.object().optional()
  }),

  // Update conversation schema
  updateConversation: Joi.object({
    title: Joi.string().max(255).optional()
      .messages({
        'string.max': 'Title must be at most 255 characters long'
      }),
    context_data: Joi.object().optional(),
    metadata: Joi.object().optional(),
    status: Joi.string().valid('active', 'archived').optional()
      .messages({
        'any.only': 'Status must be either active or archived'
      })
  }),

  // Create message schema
  createMessage: Joi.object({
    content: Joi.string().required().max(parseInt(process.env.MAX_MESSAGE_LENGTH || '10000'))
      .messages({
        'string.empty': 'Message content is required',
        'string.max': `Message content must be at most ${process.env.MAX_MESSAGE_LENGTH || '10000'} characters long`,
        'any.required': 'Message content is required'
      }),
    sender_type: Joi.string().valid('user', 'assistant', 'system').required()
      .messages({
        'any.only': 'Sender type must be one of: user, assistant, system',
        'any.required': 'Sender type is required'
      }),
    content_type: Joi.string().valid('text', 'image', 'file').optional().default('text')
      .messages({
        'any.only': 'Content type must be one of: text, image, file'
      }),
    metadata: Joi.object().optional(),
    parent_message_id: Joi.string().uuid().optional()
      .messages({
        'string.guid': 'Parent message ID must be a valid UUID'
      })
  }),

  // Query schemas
  getConversationsQuery: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    include_archived: Joi.string().valid('true', 'false').optional().default('false'),
    context_type: Joi.string().valid('general', 'assessment', 'career_guidance').optional()
  }),

  getConversationQuery: Joi.object({
    include_messages: Joi.string().valid('true', 'false').optional().default('false'),
    message_limit: Joi.number().integer().min(1).max(200).optional().default(50)
  }),

  getMessagesQuery: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  }),

  // Send message schema (for AI conversation)
  sendMessage: Joi.object({
    content: Joi.string().required().min(1).max(parseInt(process.env.MAX_MESSAGE_LENGTH || '10000'))
      .messages({
        'string.empty': 'Message content is required',
        'string.min': 'Message content cannot be empty',
        'string.max': `Message content must be at most ${process.env.MAX_MESSAGE_LENGTH || '10000'} characters long`,
        'any.required': 'Message content is required'
      }),
    content_type: Joi.string().valid('text', 'image', 'file').optional().default('text')
      .messages({
        'any.only': 'Content type must be one of: text, image, file'
      }),
    parent_message_id: Joi.string().uuid().optional()
      .messages({
        'string.guid': 'Parent message ID must be a valid UUID'
      })
  }),

  // Get messages schema (enhanced for AI conversations)
  getMessages: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50),
    include_usage: Joi.string().valid('true', 'false').optional().default('false')
      .messages({
        'any.only': 'include_usage must be either true or false'
      })
  }),

  // Usage statistics query schema
  usageStatsQuery: Joi.object({
    start_date: Joi.date().iso().optional()
      .messages({
        'date.format': 'start_date must be a valid ISO date'
      }),
    end_date: Joi.date().iso().optional()
      .messages({
        'date.format': 'end_date must be a valid ISO date'
      }),
    group_by: Joi.string().valid('day', 'week', 'month').optional().default('day')
      .messages({
        'any.only': 'group_by must be one of: day, week, month'
      })
  }),

  // System usage query schema
  systemUsageQuery: Joi.object({
    start_date: Joi.date().iso().optional()
      .messages({
        'date.format': 'start_date must be a valid ISO date'
      }),
    end_date: Joi.date().iso().optional()
      .messages({
        'date.format': 'end_date must be a valid ISO date'
      })
  })
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  schemas
};
