const { Conversation, Message, UsageTracking } = require('../models');
const OpenRouterService = require('../services/openrouterService');
const ContextService = require('../services/contextService');
const logger = require('../utils/logger');
const { SYSTEM_PROMPTS, PROHIBITED_PATTERNS } = require('../config/systemPrompts');

// Initialize services
const openrouterService = new OpenRouterService();
const contextService = new ContextService();

/**
 * Message Controller for handling AI conversation messages
 * Manages message creation, AI response generation, and usage tracking
 */
class MessageController {
  /**
   * Send a message and get AI response
   * POST /conversations/:id/messages
   */
  async sendMessage(req, res) {
    try {
      const { conversationId } = req.params;
      const { content, content_type = 'text', parent_message_id } = req.body;
      const userId = req.user.id;

      logger.info('Processing message request', {
        conversationId,
        userId,
        contentType: content_type,
        contentLength: content?.length
      });

      // Validate conversation access
      const conversation = await Conversation.findOne({
        where: { 
          id: conversationId, 
          user_id: userId 
        }
      });

      if (!conversation) {
        return res.status(404).json({ 
          error: 'Conversation not found',
          code: 'CONVERSATION_NOT_FOUND'
        });
      }

      // Validate content
      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          error: 'Message content is required',
          code: 'INVALID_CONTENT'
        });
      }

      // Log potential security threats for monitoring
      const promptInjectionPatterns = [
        /lupakan.*instruksi/i,
        /abaikan.*instruksi/i,
        /ignore.*instruction/i,
        /berperan.*sebagai/i,
        /resep.*masak/i,
        /sekarang.*kamu.*adalah/i
      ];

      const dataAccessPatterns = [
        /kirim.*data/i,
        /export.*data/i,
        /download.*data/i,
        /akses.*database/i,
        /tampilkan.*semua.*data/i
      ];

      const suspiciousPatterns = promptInjectionPatterns.filter(pattern => 
        pattern.test(content)
      );

      const dataAccessAttempts = dataAccessPatterns.filter(pattern => 
        pattern.test(content)
      );

      // Log data access attempts with high priority
      if (dataAccessAttempts.length > 0) {
        logger.error('DATA ACCESS ATTEMPT DETECTED - SECURITY ALERT', {
          conversationId,
          userId,
          dataAccessPatterns: dataAccessAttempts.map(p => p.source),
          contentLength: content.length,
          ip: req.ip,
          severity: 'HIGH',
          alert: 'IMMEDIATE_ATTENTION_REQUIRED'
        });
      }

      // Log other suspicious patterns
      if (suspiciousPatterns.length > 0) {
        logger.warn('Suspicious user input detected', {
          conversationId,
          userId,
          suspiciousPatterns: suspiciousPatterns.map(p => p.source),
          contentLength: content.length,
          ip: req.ip,
          severity: 'MEDIUM'
        });
      }

      // Save user message
      const userMessage = await Message.create({
        conversation_id: conversationId,
        sender_type: 'user',
        content: content.trim(),
        content_type: content_type,
        parent_message_id: parent_message_id
      });

      logger.info('User message saved', {
        messageId: userMessage.id,
        conversationId,
        userId
      });

      // Detect various career guidance questions for monitoring and debugging
      const isArchetypeQuestion = /apa archetype|archetype saya|tipe kepribadian|personality type|kepribadian saya|karakter saya/i.test(content);
      const isStrengthQuestion = /kekuatan|strength|kelebihan|keunggulan/i.test(content);
      const isWeaknessQuestion = /kelemahan|weakness|kekurangan/i.test(content);
      const isCareerQuestion = /karir|career|pekerjaan|profesi|rekomendasi/i.test(content);
      const isPersonalityQuestion = /kepribadian|personality|sifat|karakter/i.test(content);

      // Enhanced logging for different question types
      if (isArchetypeQuestion) {
        logger.info('ARCHETYPE QUESTION DETECTED', {
          conversationId,
          userId,
          question: content.substring(0, 100),
          hasConversationPersona: !!(conversation.context_data?.profilePersona),
          conversationContextType: conversation.context_type,
          messageId: userMessage.id
        });
      } else if (isStrengthQuestion) {
        logger.info('STRENGTH QUESTION DETECTED', {
          conversationId,
          userId,
          question: content.substring(0, 100),
          hasConversationPersona: !!(conversation.context_data?.profilePersona),
          messageId: userMessage.id
        });
      } else if (isWeaknessQuestion) {
        logger.info('WEAKNESS QUESTION DETECTED', {
          conversationId,
          userId,
          question: content.substring(0, 100),
          hasConversationPersona: !!(conversation.context_data?.profilePersona),
          messageId: userMessage.id
        });
      } else if (isCareerQuestion) {
        logger.info('CAREER QUESTION DETECTED', {
          conversationId,
          userId,
          question: content.substring(0, 100),
          hasConversationPersona: !!(conversation.context_data?.profilePersona),
          messageId: userMessage.id
        });
      } else if (isPersonalityQuestion) {
        logger.info('PERSONALITY QUESTION DETECTED', {
          conversationId,
          userId,
          question: content.substring(0, 100),
          hasConversationPersona: !!(conversation.context_data?.profilePersona),
          messageId: userMessage.id
        });
      }

      // Build conversation context for AI
      const conversationHistory = await contextService.buildConversationContext(conversationId);
      
      // Generate AI response
      const startTime = Date.now();
      const aiResponse = await openrouterService.generateResponse(
        conversationHistory,
        {
          userId: userId,
          conversationId: conversationId
        }
      );

      // Validate response to ensure it doesn't deviate from role
      const validatedResponse = this.validateGuiderResponse(aiResponse.content, content);

      // Save assistant message with validated content
      const assistantMessage = await Message.create({
        conversation_id: conversationId,
        sender_type: 'assistant',
        content: validatedResponse,
        content_type: 'text',
        parent_message_id: userMessage.id,
        metadata: {
          model: aiResponse.model,
          finish_reason: aiResponse.finishReason,
          native_finish_reason: aiResponse.nativeFinishReason,
          processing_time: aiResponse.processingTime,
          content_validated: validatedResponse !== aiResponse.content
        }
      });

      // Track usage statistics
      await UsageTracking.create({
        conversation_id: conversationId,
        message_id: assistantMessage.id,
        model_used: aiResponse.model,
        prompt_tokens: aiResponse.usage.prompt_tokens,
        completion_tokens: aiResponse.usage.completion_tokens,
        total_tokens: aiResponse.usage.total_tokens,
        cost_credits: aiResponse.usage.cost,
        is_free_model: aiResponse.usage.isFreeModel,
        processing_time_ms: aiResponse.processingTime
      });

      // Update conversation timestamp
      await conversation.update({ 
        updated_at: new Date(),
        // Update title if this is the first user message
        title: conversation.title === 'New Conversation' ? 
          this.generateConversationTitle(content) : 
          conversation.title
      });

      const totalTime = Date.now() - startTime;

      logger.info('Message processed successfully', {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        model: aiResponse.model,
        totalTime,
        usage: aiResponse.usage
      });

      res.json({
        success: true,
        data: {
          user_message: userMessage,
          assistant_message: assistantMessage,
          usage: aiResponse.usage,
          processing_time: totalTime
        }
      });

    } catch (error) {
      logger.error('Error processing message', {
        conversationId: req.params.conversationId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });

      // Handle specific OpenRouter errors
      if (error.message.includes('All OpenRouter models failed')) {
        return res.status(503).json({
          error: 'AI service temporarily unavailable. Please try again later.',
          code: 'AI_SERVICE_UNAVAILABLE'
        });
      }

      res.status(500).json({ 
        error: 'Failed to process message',
        code: 'MESSAGE_PROCESSING_ERROR'
      });
    }
  }

  /**
   * Get messages for a conversation
   * GET /conversations/:id/messages
   */
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 50, 
        include_usage = false 
      } = req.query;

      // Validate conversation access
      const conversation = await Conversation.findOne({
        where: { 
          id: conversationId, 
          user_id: userId 
        }
      });

      if (!conversation) {
        return res.status(404).json({ 
          error: 'Conversation not found',
          code: 'CONVERSATION_NOT_FOUND'
        });
      }

      const offset = (page - 1) * limit;
      const includeOptions = [];

      if (include_usage === 'true') {
        includeOptions.push({
          model: UsageTracking,
          as: 'usage_tracking',
          required: false
        });
      }

      const messages = await Message.findAndCountAll({
        where: { conversation_id: conversationId },
        include: includeOptions,
        order: [['created_at', 'ASC']],
        limit: parseInt(limit),
        offset: offset
      });

      res.json({
        messages: messages.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: messages.count,
          pages: Math.ceil(messages.count / limit)
        }
      });

    } catch (error) {
      logger.error('Error fetching messages', {
        conversationId: req.params.conversationId,
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json({ 
        error: 'Failed to fetch messages',
        code: 'FETCH_MESSAGES_ERROR'
      });
    }
  }

  /**
   * Regenerate AI response for a message
   * POST /conversations/:id/messages/:messageId/regenerate
   */
  async regenerateResponse(req, res) {
    try {
      const { conversationId, messageId } = req.params;
      const userId = req.user.id;

      // Validate conversation and message access
      const conversation = await Conversation.findOne({
        where: { 
          id: conversationId, 
          user_id: userId 
        }
      });

      if (!conversation) {
        return res.status(404).json({ 
          error: 'Conversation not found',
          code: 'CONVERSATION_NOT_FOUND'
        });
      }

      const message = await Message.findOne({
        where: {
          id: messageId,
          conversation_id: conversationId,
          sender_type: 'assistant'
        }
      });

      if (!message) {
        return res.status(404).json({
          error: 'Assistant message not found',
          code: 'MESSAGE_NOT_FOUND'
        });
      }

      // Build conversation history up to the parent message
      const conversationHistory = await contextService.buildConversationContext(
        conversationId,
        { upToMessageId: message.parent_message_id }
      );

      // Generate new AI response
      const aiResponse = await openrouterService.generateResponse(
        conversationHistory,
        { 
          userId: userId,
          conversationId: conversationId
        }
      );

      // Update the existing message
      await message.update({
        content: aiResponse.content,
        metadata: {
          ...message.metadata,
          model: aiResponse.model,
          finish_reason: aiResponse.finishReason,
          native_finish_reason: aiResponse.nativeFinishReason,
          processing_time: aiResponse.processingTime,
          regenerated_at: new Date().toISOString()
        }
      });

      // Track new usage
      await UsageTracking.create({
        conversation_id: conversationId,
        message_id: message.id,
        model_used: aiResponse.model,
        prompt_tokens: aiResponse.usage.prompt_tokens,
        completion_tokens: aiResponse.usage.completion_tokens,
        total_tokens: aiResponse.usage.total_tokens,
        cost_credits: aiResponse.usage.cost,
        is_free_model: aiResponse.usage.isFreeModel,
        processing_time_ms: aiResponse.processingTime
      });

      logger.info('Message regenerated successfully', {
        conversationId,
        messageId,
        model: aiResponse.model,
        usage: aiResponse.usage
      });

      res.json({
        success: true,
        data: {
          message: message,
          usage: aiResponse.usage
        }
      });

    } catch (error) {
      logger.error('Error regenerating message', {
        conversationId: req.params.conversationId,
        messageId: req.params.messageId,
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json({ 
        error: 'Failed to regenerate message',
        code: 'REGENERATE_ERROR'
      });
    }
  }

  /**
   * Build conversation history for AI context
   * @param {string} conversationId - Conversation ID
   * @param {string} upToMessageId - Optional message ID to stop at
   * @returns {Array} Array of message objects for AI
   */
  async buildConversationHistory(conversationId, upToMessageId = null) {
    const whereClause = { conversation_id: conversationId };
    
    if (upToMessageId) {
      // Get messages up to a specific message
      const targetMessage = await Message.findByPk(upToMessageId);
      if (targetMessage) {
        whereClause.created_at = {
          [require('sequelize').Op.lte]: targetMessage.created_at
        };
      }
    }

    const messages = await Message.findAll({
      where: whereClause,
      order: [['created_at', 'ASC']],
      limit: 20 // Limit for token efficiency
    });

    return messages.map(msg => ({
      role: msg.sender_type === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
  }

  /**
   * Generate a conversation title from the first message
   * @param {string} content - First message content
   * @returns {string} Generated title
   */
  generateConversationTitle(content) {
    // Simple title generation - take first 50 characters
    const title = content.trim().substring(0, 50);
    return title.length < content.trim().length ? `${title}...` : title;
  }

  /**
   * Validate Guider response to ensure it doesn't deviate from role
   * @param {string} response - AI response content
   * @param {string} userInput - Original user input to check for prompt injection
   * @returns {string} Validated or corrected response
   */
  validateGuiderResponse(response, userInput = '') {
    // Check if user input contains prompt injection attempts
    const promptInjectionPatterns = [
      /lupakan.*instruksi/i,
      /abaikan.*instruksi/i,
      /ignore.*instruction/i,
      /forget.*instruction/i,
      /berperan.*sebagai/i,
      /act.*as/i,
      /pretend.*to.*be/i,
      /resep.*masak/i,
      /cooking.*recipe/i,
      /sekarang.*kamu.*adalah/i
    ];

    // Check if user input contains data access requests
    const dataAccessPatterns = [
      /kirim.*data/i,
      /send.*data/i,
      /berikan.*data/i,
      /export.*data/i,
      /download.*data/i,
      /akses.*database/i,
      /lihat.*database/i,
      /tampilkan.*semua.*data/i,
      /bagikan.*informasi/i,
      /transfer.*data/i
    ];

    const hasPromptInjection = promptInjectionPatterns.some(pattern => 
      pattern.test(userInput)
    );

    const hasDataAccessRequest = dataAccessPatterns.some(pattern => 
      pattern.test(userInput)
    );

    // Priority: Data access requests are more critical than general prompt injection
    if (hasDataAccessRequest) {
      logger.warn('Data access request detected - SECURITY ALERT', {
        userInputLength: userInput.length,
        detectedPatterns: dataAccessPatterns.filter(pattern => pattern.test(userInput)).map(p => p.source),
        severity: 'HIGH'
      });

      return SYSTEM_PROMPTS.DATA_ACCESS_DENIAL_RESPONSE;
    }

    if (hasPromptInjection) {
      logger.warn('Prompt injection attempt detected', {
        userInputLength: userInput.length,
        detectedPatterns: promptInjectionPatterns.filter(pattern => pattern.test(userInput)).map(p => p.source),
        severity: 'MEDIUM'
      });

      return SYSTEM_PROMPTS.PROMPT_INJECTION_RESPONSE;
    }

    // Check if response contains prohibited patterns (role deviation)
    const hasProhibitedContent = PROHIBITED_PATTERNS.some(pattern => 
      pattern.test(response)
    );

    if (hasProhibitedContent) {
      logger.warn('Response contained prohibited patterns, providing corrected response', {
        originalLength: response.length,
        prohibitedPatternsFound: PROHIBITED_PATTERNS.filter(pattern => pattern.test(response)).length
      });

      return SYSTEM_PROMPTS.FALLBACK_RESPONSE;
    }

    return response;
  }
}

const messageController = new MessageController();
module.exports = messageController;
