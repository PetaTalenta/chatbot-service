const axios = require('axios');
const OpenRouterService = require('../../src/services/openrouterService');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('OpenRouterService', () => {
  let openrouterService;
  let mockAxiosInstance;

  beforeEach(() => {
    // Reset environment variables
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.DEFAULT_MODEL = 'qwen/qwen-2.5-coder-32b-instruct:free';
    process.env.FALLBACK_MODEL = 'meta-llama/llama-3.2-3b-instruct:free';
    process.env.EMERGENCY_FALLBACK_MODEL = 'openai/gpt-4o-mini';
    process.env.USE_FREE_MODELS_ONLY = 'true';
    process.env.MAX_TOKENS = '1000';
    process.env.TEMPERATURE = '0.7';
    process.env.OPENROUTER_TIMEOUT = '45000';
    process.env.HTTP_REFERER = 'https://atma.chhrone.web.id';
    process.env.X_TITLE = 'ATMA - AI Talent Mapping Assessment';

    // Mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    openrouterService = new OpenRouterService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://atma.chhrone.web.id',
          'X-Title': 'ATMA - AI Talent Mapping Assessment'
        },
        timeout: 45000
      });
    });

    it('should throw error if API key is missing', () => {
      delete process.env.OPENROUTER_API_KEY;
      expect(() => new OpenRouterService()).toThrow('OPENROUTER_API_KEY is required');
    });

    it('should use fallback values for HTTP_REFERER and X_TITLE when env vars are not set', () => {
      delete process.env.HTTP_REFERER;
      delete process.env.X_TITLE;

      new OpenRouterService();

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://atma.chhrone.web.id',
          'X-Title': 'ATMA - AI Talent Mapping Assessment'
        },
        timeout: 45000
      });
    });

    it('should use custom values for HTTP_REFERER and X_TITLE when env vars are set', () => {
      process.env.HTTP_REFERER = 'https://custom-domain.com';
      process.env.X_TITLE = 'Custom App Title';

      new OpenRouterService();

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://custom-domain.com',
          'X-Title': 'Custom App Title'
        },
        timeout: 45000
      });
    });
  });

  describe('generateResponse', () => {
    const mockMessages = [
      { role: 'user', content: 'Hello, how are you?' }
    ];

    const mockSuccessResponse = {
      data: {
        choices: [{
          message: { content: 'I am doing well, thank you!' },
          finish_reason: 'stop',
          native_finish_reason: 'stop'
        }],
        model: 'qwen/qwen-2.5-coder-32b-instruct:free',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        }
      }
    };

    it('should generate response successfully with free model', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockSuccessResponse);

      const result = await openrouterService.generateResponse(mockMessages, {
        userId: 'test-user-id'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', {
        model: 'qwen/qwen-2.5-coder-32b-instruct:free',
        messages: mockMessages,
        max_tokens: 1000,
        temperature: 0.7,
        user: 'test-user-id',
        usage: { include: true }
      });

      expect(result).toEqual({
        content: 'I am doing well, thank you!',
        model: 'qwen/qwen-2.5-coder-32b-instruct:free',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
          cost: 0,
          isFreeModel: true
        },
        processingTime: expect.any(Number),
        finishReason: 'stop',
        nativeFinishReason: 'stop'
      });
    });

    it('should include optional parameters when provided', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockSuccessResponse);

      await openrouterService.generateResponse(mockMessages, {
        userId: 'test-user-id',
        maxTokens: 500,
        temperature: 0.5,
        topP: 0.9,
        stop: ['END']
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', {
        model: 'qwen/qwen-2.5-coder-32b-instruct:free',
        messages: mockMessages,
        max_tokens: 500,
        temperature: 0.5,
        top_p: 0.9,
        stop: ['END'],
        user: 'test-user-id',
        usage: { include: true }
      });
    });

    it('should handle fallback when primary model fails', async () => {
      const error = new Error('Model unavailable');
      mockAxiosInstance.post
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          ...mockSuccessResponse,
          data: {
            ...mockSuccessResponse.data,
            model: 'meta-llama/llama-3.2-3b-instruct:free'
          }
        });

      const result = await openrouterService.generateResponse(mockMessages, {
        userId: 'test-user-id'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
      expect(result.model).toBe('meta-llama/llama-3.2-3b-instruct:free');
    });

    it('should throw error when all models fail', async () => {
      const error = new Error('All models unavailable');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(
        openrouterService.generateResponse(mockMessages, { userId: 'test-user-id' })
      ).rejects.toThrow('All OpenRouter models failed');
    });
  });

  describe('isFreeModel', () => {
    it('should correctly identify free models', () => {
      expect(openrouterService.isFreeModel('qwen/qwen-2.5-coder-32b-instruct:free')).toBe(true);
      expect(openrouterService.isFreeModel('meta-llama/llama-3.2-3b-instruct:free')).toBe(true);
      expect(openrouterService.isFreeModel('some-model:free')).toBe(true);
      expect(openrouterService.isFreeModel('openai/gpt-4o-mini')).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch available models successfully', async () => {
      const mockModelsResponse = {
        data: {
          data: [
            { id: 'model1', name: 'Model 1' },
            { id: 'model2', name: 'Model 2' }
          ]
        }
      };

      mockAxiosInstance.get.mockResolvedValue(mockModelsResponse);

      const result = await openrouterService.getAvailableModels();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models');
      expect(result).toEqual(mockModelsResponse.data.data);
    });

    it('should handle error when fetching models fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(openrouterService.getAvailableModels()).rejects.toThrow('Failed to fetch available models');
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status information', () => {
      const healthStatus = openrouterService.getHealthStatus();

      expect(healthStatus).toEqual({
        service: 'OpenRouter',
        status: 'healthy',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultModel: 'qwen/qwen-2.5-coder-32b-instruct:free',
        useFreeModelsOnly: true,
        timeout: 45000,
        timestamp: expect.any(String)
      });
    });
  });

  describe('handleFallback', () => {
    const mockMessages = [{ role: 'user', content: 'Test message' }];
    const mockError = new Error('Primary model failed');

    it('should try fallback model first', async () => {
      const spy = jest.spyOn(openrouterService, 'generateResponse');
      spy.mockResolvedValueOnce({ content: 'Fallback response' });

      const result = await openrouterService.handleFallback(mockMessages, {}, mockError);

      expect(spy).toHaveBeenCalledWith(mockMessages, {
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        isFirstRetry: true
      });
      expect(result.content).toBe('Fallback response');

      spy.mockRestore();
    });

    it('should try emergency model if free models only is disabled', async () => {
      openrouterService.useFreeModelsOnly = false;
      const spy = jest.spyOn(openrouterService, 'generateResponse');
      spy.mockResolvedValueOnce({ content: 'Emergency response' });

      const result = await openrouterService.handleFallback(mockMessages, {
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        isFirstRetry: true
      }, mockError);

      expect(spy).toHaveBeenCalledWith(mockMessages, {
        model: 'openai/gpt-4o-mini',
        isFirstRetry: true,
        isSecondRetry: true
      });
      expect(result.content).toBe('Emergency response');

      spy.mockRestore();
    });

    it('should throw error when all fallbacks are exhausted', async () => {
      await expect(
        openrouterService.handleFallback(mockMessages, {
          model: 'openai/gpt-4o-mini',
          isSecondRetry: true
        }, mockError)
      ).rejects.toThrow(/All OpenRouter models failed/);
    });
  });
});
