const { Conversation, Message, UsageTracking } = require('../models');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { SYSTEM_PROMPTS } = require('../config/systemPrompts');

/**
 * Create a new conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const createConversation = async (req, res, next) => {
  try {
    const { title, profilePersona, resultsId, metadata } = req.body;
    const userId = req.user.id; // From auth middleware

    // Create conversation and store profilePersona in context_data if provided
    const conversation = await Conversation.create({
      user_id: userId,
      title: title || 'New Conversation',
      context_type: 'career_guidance',
      context_data: profilePersona ? { profilePersona } : null, // Store profilePersona for later use
      metadata,
      status: 'active'
    });

    logger.info('Conversation created successfully', {
      conversationId: conversation.id,
      userId,
      contextType: conversation.context_type,
      hasProfilePersona: !!profilePersona,
      ip: req.ip
    });

    // If profilePersona is provided, create initial system message with LLM
    let initialMessage = null;
    if (profilePersona) {
      try {
        const OpenRouterService = require('../services/openrouterService');
        const openrouterService = new OpenRouterService();

        // Create system message with profile persona context
        const systemMessages = [
          {
            role: 'system',
            content: SYSTEM_PROMPTS.INITIAL_CONVERSATION
          },
          {
            role: 'system',
            content: `Profile Persona Pengguna yang Sudah Dianalisis:\n${JSON.stringify(profilePersona, null, 2)}`
          },
          {
            role: 'user',
            content: 'Halo! Berdasarkan profile persona saya yang sudah dianalisis, bisakah Anda memperkenalkan diri dan memberikan gambaran singkat tentang bagaimana Anda bisa membantu saya dalam pengembangan karir? Tolong jelaskan secara singkat hasil analisis kepribadian saya.'
          }
        ];

        // Generate initial response from LLM
        const aiResponse = await openrouterService.generateResponse(systemMessages, {
          userId: userId,
          conversationId: conversation.id
        });

        // Save the initial user message
        const { Message } = require('../models');
        const userMessage = await Message.create({
          conversation_id: conversation.id,
          sender_type: 'user',
          content: 'Halo! Berdasarkan profile persona saya, bisakah Anda memperkenalkan diri dan memberikan gambaran singkat tentang bagaimana Anda bisa membantu saya dalam pengembangan karir?',
          content_type: 'text'
        });

        // Save the assistant's response
        const assistantMessage = await Message.create({
          conversation_id: conversation.id,
          sender_type: 'assistant',
          content: aiResponse.content,
          content_type: 'text',
          parent_message_id: userMessage.id,
          metadata: {
            model: aiResponse.model,
            finish_reason: aiResponse.finishReason,
            processing_time: aiResponse.processingTime
          }
        });

        // Track usage
        const { UsageTracking } = require('../models');
        await UsageTracking.create({
          conversation_id: conversation.id,
          message_id: assistantMessage.id,
          model_used: aiResponse.model,
          prompt_tokens: aiResponse.usage.prompt_tokens,
          completion_tokens: aiResponse.usage.completion_tokens,
          total_tokens: aiResponse.usage.total_tokens,
          cost_credits: aiResponse.usage.cost,
          is_free_model: aiResponse.usage.isFreeModel,
          processing_time_ms: aiResponse.processingTime
        });

        initialMessage = {
          user_message: userMessage,
          assistant_message: assistantMessage
        };

        logger.info('Initial conversation with profile persona created', {
          conversationId: conversation.id,
          userId,
          model: aiResponse.model
        });

      } catch (error) {
        logger.error('Error creating initial message with profile persona', {
          conversationId: conversation.id,
          userId,
          error: error.message
        });
        // Don't fail the conversation creation if initial message fails
      }
    }

    // If resultsId is provided, link the conversation to the analysis result
    if (resultsId) {
      try {
        const archiveService = require('../services/archiveService');
        await archiveService.updateAnalysisResult(resultsId, conversation.id);

        logger.info('Analysis result linked to conversation', {
          conversationId: conversation.id,
          resultsId,
          userId
        });
      } catch (error) {
        logger.error('Failed to link analysis result to conversation', {
          conversationId: conversation.id,
          resultsId,
          userId,
          error: error.message
        });
        // Don't fail the conversation creation if linking fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully',
      data: {
        conversation,
        initial_message: initialMessage
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's conversations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      include_archived = false,
      context_type 
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {
      user_id: userId
    };

    // Filter by status
    if (include_archived === 'true') {
      whereClause.status = ['active', 'archived'];
    } else {
      whereClause.status = 'active';
    }

    // Filter by context type
    if (context_type) {
      whereClause.context_type = context_type;
    }

    const { count, rows: conversations } = await Conversation.findAndCountAll({
      where: whereClause,
      order: [['updated_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Message,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          required: false
        }
      ]
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        conversations,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: count,
          items_per_page: parseInt(limit),
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { include_messages = false, message_limit = 50 } = req.query;

    const includeOptions = [];
    
    if (include_messages === 'true') {
      includeOptions.push({
        model: Message,
        as: 'messages',
        limit: parseInt(message_limit),
        order: [['created_at', 'ASC']]
      });
    }

    const conversation = await Conversation.findOne({
      where: {
        id,
        user_id: userId,
        status: ['active', 'archived'] // Allow access to archived conversations
      },
      include: includeOptions
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        conversation
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const updateConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, context_data, metadata, status } = req.body;

    const conversation = await Conversation.findOne({
      where: {
        id,
        user_id: userId,
        status: ['active', 'archived'] // Can't update deleted conversations
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found'
        }
      });
    }

    // Update allowed fields
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (context_data !== undefined) updateData.context_data = context_data;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (status !== undefined && ['active', 'archived'].includes(status)) {
      updateData.status = status;
    }

    await conversation.update(updateData);

    logger.info('Conversation updated successfully', {
      conversationId: conversation.id,
      userId,
      updatedFields: Object.keys(updateData),
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Conversation updated successfully',
      data: {
        conversation
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a conversation (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
      where: {
        id,
        user_id: userId,
        status: ['active', 'archived'] // Can't delete already deleted conversations
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found'
        }
      });
    }

    // Soft delete by updating status
    await conversation.update({ status: 'deleted' });

    logger.info('Conversation deleted successfully', {
      conversationId: conversation.id,
      userId,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get conversation messages
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getConversationMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;

    // First verify user has access to this conversation
    const conversation = await Conversation.findOne({
      where: {
        id,
        user_id: userId,
        status: ['active', 'archived']
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found'
        }
      });
    }

    const offset = (page - 1) * limit;

    const { count, rows: messages } = await Message.findAndCountAll({
      where: {
        conversation_id: id
      },
      order: [['created_at', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        messages,
        conversation_id: id,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: count,
          items_per_page: parseInt(limit),
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  getConversationMessages
};
