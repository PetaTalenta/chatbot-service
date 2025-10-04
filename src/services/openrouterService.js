const axios = require('axios');
const logger = require('../utils/logger');

/**
 * OpenRouter Service for AI conversation integration
 * Implements free model strategy with fallback mechanism
 * Based on OpenRouter API v1 documentation
 */
class OpenRouterService {
  constructor() {
    this.baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.defaultModel = process.env.DEFAULT_MODEL || 'x-ai/grok-4-fast:free';
    this.fallbackModel = process.env.FALLBACK_MODEL || 'z-ai/glm-4.5-air:free';
    this.emergencyFallbackModel = process.env.EMERGENCY_FALLBACK_MODEL || 'deepseek/deepseek-chat-v3.1:free';
    this.additionalFallbackModel = process.env.ADDITIONAL_FALLBACK_MODEL || 'deepseek/deepseek-r1-0528:free';
    this.useFreeModelsOnly = process.env.USE_FREE_MODELS_ONLY === 'true';
    this.maxTokens = parseInt(process.env.MAX_TOKENS) || 1000;
    this.temperature = parseFloat(process.env.TEMPERATURE) || 0.7;
    this.timeout = parseInt(process.env.OPENROUTER_TIMEOUT) || 45000;

    // Validate required configuration
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is required');
    }

    // Create axios client with OpenRouter configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.HTTP_REFERER || 'https://atma.chhrone.web.id',
        'X-Title': process.env.X_TITLE || 'ATMA - AI Talent Mapping Assessment'
      },
      timeout: this.timeout
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('OpenRouter API Request', {
          url: config.url,
          method: config.method,
          model: config.data?.model,
          messageCount: config.data?.messages?.length
        });
        return config;
      },
      (error) => {
        logger.error('OpenRouter API Request Error', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('OpenRouter API Response', {
          status: response.status,
          model: response.data?.model,
          usage: response.data?.usage
        });
        return response;
      },
      (error) => {
        logger.error('OpenRouter API Response Error', {
          status: error.response?.status,
          message: error.response?.data?.error?.message || error.message,
          model: error.config?.data ? JSON.parse(error.config.data)?.model : 'unknown'
        });
        return Promise.reject(error);
      }
    );

    logger.info('OpenRouter Service initialized', {
      baseURL: this.baseURL,
      defaultModel: this.defaultModel,
      fallbackModel: this.fallbackModel,
      emergencyFallbackModel: this.emergencyFallbackModel,
      additionalFallbackModel: this.additionalFallbackModel,
      useFreeModelsOnly: this.useFreeModelsOnly,
      timeout: this.timeout
    });
  }

  /**
   * Generate AI response using OpenRouter API
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Generation options
   * @returns {Object} Response with content, model, usage, and metadata
   */
  async generateResponse(messages, options = {}) {
    const startTime = Date.now();

    try {
      const model = options.model || this.defaultModel;
      const isFreeModel = this.isFreeModel(model);

      // SECURITY: Reject any attempt to use paid tools (web_search, etc.)
      // This chatbot only does text-to-text completion to avoid costs
      if (options.tools) {
        logger.error('REJECTED: Attempt to use paid tools detected', {
          tools: options.tools,
          userId: options.userId
        });
        throw new Error('Tools usage is disabled. This chatbot only supports text-to-text completion.');
      }

      // Use messages as-is since profile persona context is handled during conversation creation
      let processedMessages = [...messages];

      // Build request payload according to OpenRouter API spec
      // NOTE: We deliberately DO NOT include 'tools' parameter to avoid paid features
      const payload = {
        model: model,
        messages: processedMessages,
        max_tokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        user: options.userId, // For user tracking and optimization
        usage: { include: true } // Include usage statistics in response
      };

      // Add optional parameters if provided
      if (options.stop) payload.stop = options.stop;
      if (options.topP) payload.top_p = options.topP;
      if (options.topK) payload.top_k = options.topK;
      if (options.frequencyPenalty) payload.frequency_penalty = options.frequencyPenalty;
      if (options.presencePenalty) payload.presence_penalty = options.presencePenalty;

      // SECURITY: Double-check that tools are never accidentally added to payload
      if (payload.tools) {
        delete payload.tools;
        logger.warn('Removed tools parameter from payload to prevent paid features');
      }

      logger.info('Generating OpenRouter response', {
        model,
        messageCount: messages.length,
        isFreeModel,
        userId: options.userId
      });

      const response = await this.client.post('/chat/completions', payload);
      const processingTime = Date.now() - startTime;

      // Validate response structure
      if (!response.data) {
        throw new Error('Invalid response: missing data');
      }

      if (!response.data.choices || !Array.isArray(response.data.choices) || response.data.choices.length === 0) {
        logger.error('Invalid OpenRouter response structure', {
          hasData: !!response.data,
          hasChoices: !!response.data.choices,
          choicesLength: response.data.choices?.length,
          responseData: JSON.stringify(response.data, null, 2)
        });
        throw new Error('Invalid response: missing or empty choices array');
      }

      // Extract response data
      const choice = response.data.choices[0];
      const usage = response.data.usage || {};

      // Validate choice structure
      if (!choice.message || !choice.message.content) {
        logger.error('Invalid choice structure', {
          choice: JSON.stringify(choice, null, 2)
        });
        throw new Error('Invalid response: missing message content');
      }

      const result = {
        content: choice.message.content,
        model: response.data.model,
        usage: {
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
          cost: isFreeModel ? 0 : (usage.cost || 0),
          isFreeModel: isFreeModel
        },
        processingTime,
        finishReason: choice.finish_reason,
        nativeFinishReason: choice.native_finish_reason
      };

      logger.info('OpenRouter response generated successfully', {
        model: result.model,
        processingTime: result.processingTime,
        usage: result.usage,
        finishReason: result.finishReason
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.warn('OpenRouter primary model failed, attempting fallback', {
        model: options.model || this.defaultModel,
        error: error.message,
        processingTime
      });

      return this.handleFallback(messages, options, error);
    }
  }

  /**
   * Handle fallback strategy when primary model fails
   * @param {Array} messages - Original messages
   * @param {Object} options - Original options
   * @param {Error} originalError - Error from primary attempt
   * @returns {Object} Response from fallback model
   */
  async handleFallback(messages, options, originalError) {
    const currentModel = options.model || this.defaultModel;

    // First fallback: try second free model
    if (currentModel !== this.fallbackModel && !options.isFirstRetry) {
      logger.info('Attempting first fallback model', {
        from: currentModel,
        to: this.fallbackModel
      });

      return this.generateResponse(messages, {
        ...options,
        model: this.fallbackModel,
        isFirstRetry: true
      });
    }

    // Second fallback: try third free model
    if (currentModel !== this.emergencyFallbackModel && !options.isSecondRetry) {
      logger.info('Attempting second fallback model', {
        from: currentModel,
        to: this.emergencyFallbackModel
      });

      return this.generateResponse(messages, {
        ...options,
        model: this.emergencyFallbackModel,
        isSecondRetry: true
      });
    }

    // Third fallback: try fourth free model
    if (currentModel !== this.additionalFallbackModel && !options.isThirdRetry) {
      logger.info('Attempting third fallback model', {
        from: currentModel,
        to: this.additionalFallbackModel
      });

      return this.generateResponse(messages, {
        ...options,
        model: this.additionalFallbackModel,
        isThirdRetry: true
      });
    }

    // All fallbacks exhausted
    logger.error('All OpenRouter models failed', {
      defaultModel: this.defaultModel,
      fallbackModel: this.fallbackModel,
      emergencyModel: this.emergencyFallbackModel,
      additionalModel: this.additionalFallbackModel,
      originalError: originalError.message,
      useFreeModelsOnly: this.useFreeModelsOnly
    });

    throw new Error(`All OpenRouter models failed. Original error: ${originalError.message}`);
  }

  /**
   * Check if a model is a free model
   * @param {string} model - Model identifier
   * @returns {boolean} True if model is free
   */
  isFreeModel(model) {
    return model.includes(':free') ||
           model === 'x-ai/grok-4-fast:free' ||
           model === 'z-ai/glm-4.5-air:free' ||
           model === 'deepseek/deepseek-chat-v3.1:free' ||
           model === 'deepseek/deepseek-r1-0528:free';
  }

  /**
   * Get available models from OpenRouter
   * @returns {Array} List of available models
   */
  async getAvailableModels() {
    try {
      const response = await this.client.get('/models');
      return response.data.data || response.data;
    } catch (error) {
      logger.error('Failed to fetch available models', error);
      throw new Error('Failed to fetch available models');
    }
  }

  /**
   * Get service health status
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    return {
      service: 'OpenRouter',
      status: 'healthy',
      baseURL: this.baseURL,
      defaultModel: this.defaultModel,
      useFreeModelsOnly: this.useFreeModelsOnly,
      timeout: this.timeout,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = OpenRouterService;
