const messageController = require('../../src/controllers/messageController');
const { Conversation, Message, UsageTracking } = require('../../src/models');
const OpenRouterService = require('../../src/services/openrouterService');

// Mock dependencies
jest.mock('../../src/models');
jest.mock('../../src/services/openrouterService');

describe('MessageController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: { conversationId: 'test-conversation-id' },
      body: { content: 'Hello, how are you?' },
      user: { id: 'test-user-id' },
      query: {}
    };

    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    const mockConversation = {
      id: 'test-conversation-id',
      user_id: 'test-user-id',
      title: 'New Conversation',
      update: jest.fn()
    };

    const mockUserMessage = {
      id: 'user-message-id',
      conversation_id: 'test-conversation-id',
      sender_type: 'user',
      content: 'Hello, how are you?'
    };

    const mockAssistantMessage = {
      id: 'assistant-message-id',
      conversation_id: 'test-conversation-id',
      sender_type: 'assistant',
      content: 'I am doing well, thank you!'
    };

    const mockAiResponse = {
      content: 'I am doing well, thank you!',
      model: 'qwen/qwen-2.5-coder-32b-instruct:free',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
        cost: 0,
        isFreeModel: true
      },
      processingTime: 1500,
      finishReason: 'stop',
      nativeFinishReason: 'stop'
    };

    beforeEach(() => {
      Conversation.findOne.mockResolvedValue(mockConversation);
      Message.create.mockResolvedValueOnce(mockUserMessage).mockResolvedValueOnce(mockAssistantMessage);
      Message.findAll.mockResolvedValue([]);
      UsageTracking.create.mockResolvedValue({});
      
      // Mock OpenRouter service
      const mockOpenRouterInstance = {
        generateResponse: jest.fn().mockResolvedValue(mockAiResponse)
      };
      OpenRouterService.mockImplementation(() => mockOpenRouterInstance);
    });

    it('should send message and generate AI response successfully', async () => {
      await messageController.sendMessage(req, res);

      expect(Conversation.findOne).toHaveBeenCalledWith({
        where: { id: 'test-conversation-id', user_id: 'test-user-id' }
      });

      expect(Message.create).toHaveBeenCalledTimes(2);
      expect(Message.create).toHaveBeenNthCalledWith(1, {
        conversation_id: 'test-conversation-id',
        sender_type: 'user',
        content: 'Hello, how are you?',
        content_type: 'text',
        parent_message_id: undefined
      });

      expect(UsageTracking.create).toHaveBeenCalledWith({
        conversation_id: 'test-conversation-id',
        message_id: 'assistant-message-id',
        model_used: 'qwen/qwen-2.5-coder-32b-instruct:free',
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
        cost_credits: 0,
        is_free_model: true,
        processing_time_ms: 1500
      });

      expect(res.json).toHaveBeenCalledWith({
        user_message: mockUserMessage,
        assistant_message: mockAssistantMessage,
        usage: mockAiResponse.usage,
        processing_time: expect.any(Number)
      });
    });

    it('should return 404 if conversation not found', async () => {
      Conversation.findOne.mockResolvedValue(null);

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    });

    it('should return 400 if content is empty', async () => {
      req.body.content = '';

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Message content is required',
        code: 'INVALID_CONTENT'
      });
    });

    it('should handle OpenRouter service errors', async () => {
      const mockOpenRouterInstance = {
        generateResponse: jest.fn().mockRejectedValue(new Error('All OpenRouter models failed'))
      };
      OpenRouterService.mockImplementation(() => mockOpenRouterInstance);

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'AI service temporarily unavailable. Please try again later.',
        code: 'AI_SERVICE_UNAVAILABLE'
      });
    });

    it('should update conversation title if it is "New Conversation"', async () => {
      await messageController.sendMessage(req, res);

      expect(mockConversation.update).toHaveBeenCalledWith({
        updated_at: expect.any(Date),
        title: 'Hello, how are you?'
      });
    });
  });

  describe('getMessages', () => {
    const mockMessages = [
      { id: 'msg1', content: 'Hello', sender_type: 'user' },
      { id: 'msg2', content: 'Hi there!', sender_type: 'assistant' }
    ];

    beforeEach(() => {
      Conversation.findOne.mockResolvedValue({ id: 'test-conversation-id' });
      Message.findAndCountAll.mockResolvedValue({
        rows: mockMessages,
        count: 2
      });
    });

    it('should get messages successfully', async () => {
      req.query = { page: 1, limit: 50 };

      await messageController.getMessages(req, res);

      expect(Message.findAndCountAll).toHaveBeenCalledWith({
        where: { conversation_id: 'test-conversation-id' },
        include: [],
        order: [['created_at', 'ASC']],
        limit: 50,
        offset: 0
      });

      expect(res.json).toHaveBeenCalledWith({
        messages: mockMessages,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          pages: 1
        }
      });
    });

    it('should include usage tracking when requested', async () => {
      req.query = { include_usage: 'true' };

      await messageController.getMessages(req, res);

      expect(Message.findAndCountAll).toHaveBeenCalledWith({
        where: { conversation_id: 'test-conversation-id' },
        include: [{
          model: UsageTracking,
          as: 'usage_tracking',
          required: false
        }],
        order: [['created_at', 'ASC']],
        limit: 50,
        offset: 0
      });
    });

    it('should return 404 if conversation not found', async () => {
      Conversation.findOne.mockResolvedValue(null);

      await messageController.getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    });
  });

  describe('regenerateResponse', () => {
    const mockMessage = {
      id: 'assistant-message-id',
      conversation_id: 'test-conversation-id',
      sender_type: 'assistant',
      parent_message_id: 'user-message-id',
      update: jest.fn()
    };

    const mockAiResponse = {
      content: 'Regenerated response',
      model: 'qwen/qwen-2.5-coder-32b-instruct:free',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        cost: 0,
        isFreeModel: true
      },
      processingTime: 2000,
      finishReason: 'stop'
    };

    beforeEach(() => {
      req.params.messageId = 'assistant-message-id';
      Conversation.findOne.mockResolvedValue({ id: 'test-conversation-id' });
      Message.findOne.mockResolvedValue(mockMessage);
      Message.findAll.mockResolvedValue([]);
      UsageTracking.create.mockResolvedValue({});

      const mockOpenRouterInstance = {
        generateResponse: jest.fn().mockResolvedValue(mockAiResponse)
      };
      OpenRouterService.mockImplementation(() => mockOpenRouterInstance);
    });

    it('should regenerate response successfully', async () => {
      await messageController.regenerateResponse(req, res);

      expect(Message.findOne).toHaveBeenCalledWith({
        where: {
          id: 'assistant-message-id',
          conversation_id: 'test-conversation-id',
          sender_type: 'assistant'
        }
      });

      expect(mockMessage.update).toHaveBeenCalledWith({
        content: 'Regenerated response',
        metadata: expect.objectContaining({
          model: 'qwen/qwen-2.5-coder-32b-instruct:free',
          finish_reason: 'stop',
          processing_time: 2000,
          regenerated_at: expect.any(String)
        })
      });

      expect(res.json).toHaveBeenCalledWith({
        message: mockMessage,
        usage: mockAiResponse.usage
      });
    });

    it('should return 404 if message not found', async () => {
      Message.findOne.mockResolvedValue(null);

      await messageController.regenerateResponse(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Assistant message not found',
        code: 'MESSAGE_NOT_FOUND'
      });
    });
  });

  describe('buildConversationHistory', () => {
    const mockMessages = [
      { sender_type: 'user', content: 'Hello' },
      { sender_type: 'assistant', content: 'Hi there!' },
      { sender_type: 'user', content: 'How are you?' }
    ];

    beforeEach(() => {
      Message.findAll.mockResolvedValue(mockMessages);
    });

    it('should build conversation history correctly', async () => {
      const history = await messageController.buildConversationHistory('test-conversation-id');

      expect(Message.findAll).toHaveBeenCalledWith({
        where: { conversation_id: 'test-conversation-id' },
        order: [['created_at', 'ASC']],
        limit: 20
      });

      expect(history).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ]);
    });
  });

  describe('generateConversationTitle', () => {
    it('should generate title from content', () => {
      const title = messageController.generateConversationTitle('Hello, how are you today?');
      expect(title).toBe('Hello, how are you today?');
    });

    it('should truncate long content', () => {
      const longContent = 'This is a very long message that should be truncated because it exceeds the maximum length';
      const title = messageController.generateConversationTitle(longContent);
      expect(title).toBe('This is a very long message that should be trunca...');
      expect(title.length).toBe(53); // 50 chars + '...'
    });
  });
});
