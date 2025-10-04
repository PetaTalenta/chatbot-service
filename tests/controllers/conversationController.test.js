const request = require('supertest');
const app = require('../../src/app');
const { Conversation, Message } = require('../../src/models');

// Mock the models
jest.mock('../../src/models', () => ({
  Conversation: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn()
  },
  Message: {
    findAndCountAll: jest.fn()
  },
  sequelize: {
    query: jest.fn()
  }
}));

// Mock authentication middleware
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: jest.fn((req, res, next) => {
    req.user = global.testUtils.createMockUser();
    next();
  }),
  setUserContext: jest.fn((req, res, next) => next())
}));

// Mock rate limiter
jest.mock('../../src/middleware/rateLimiter', () => ({
  conversationLimiter: jest.fn((req, res, next) => next())
}));

describe('Conversation Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /conversations', () => {
    it('should create a new conversation successfully', async () => {
      const mockConversation = global.testUtils.createMockConversation();
      Conversation.create.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/conversations')
        .send({
          title: 'Test Conversation',
          context_type: 'general'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation).toEqual(mockConversation);
      expect(Conversation.create).toHaveBeenCalledWith({
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test Conversation',
        context_type: 'general',
        context_data: undefined,
        metadata: undefined,
        status: 'active'
      });
    });

    it('should create conversation with default title', async () => {
      const mockConversation = global.testUtils.createMockConversation();
      Conversation.create.mockResolvedValue(mockConversation);

      const response = await request(app)
        .post('/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(Conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Conversation',
          context_type: 'general'
        })
      );
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/conversations')
        .send({
          context_type: 'invalid_type'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /conversations', () => {
    it('should get user conversations successfully', async () => {
      const mockConversations = [global.testUtils.createMockConversation()];
      Conversation.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: mockConversations
      });

      const response = await request(app)
        .get('/conversations');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversations).toEqual(mockConversations);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should handle pagination parameters', async () => {
      Conversation.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: []
      });

      const response = await request(app)
        .get('/conversations?page=2&limit=10');

      expect(response.status).toBe(200);
      expect(Conversation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 10
        })
      );
    });
  });

  describe('GET /conversations/:id', () => {
    it('should get specific conversation successfully', async () => {
      const mockConversation = global.testUtils.createMockConversation();
      Conversation.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/conversations/660e8400-e29b-41d4-a716-446655440001');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation).toEqual(mockConversation);
    });

    it('should return 404 for non-existent conversation', async () => {
      Conversation.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/conversations/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  describe('PUT /conversations/:id', () => {
    it('should update conversation successfully', async () => {
      const mockConversation = {
        ...global.testUtils.createMockConversation(),
        update: jest.fn().mockResolvedValue(true)
      };
      Conversation.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .put('/conversations/660e8400-e29b-41d4-a716-446655440001')
        .send({
          title: 'Updated Title'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockConversation.update).toHaveBeenCalledWith({
        title: 'Updated Title'
      });
    });
  });

  describe('DELETE /conversations/:id', () => {
    it('should soft delete conversation successfully', async () => {
      const mockConversation = {
        ...global.testUtils.createMockConversation(),
        update: jest.fn().mockResolvedValue(true)
      };
      Conversation.findOne.mockResolvedValue(mockConversation);

      const response = await request(app)
        .delete('/conversations/660e8400-e29b-41d4-a716-446655440001');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockConversation.update).toHaveBeenCalledWith({
        status: 'deleted'
      });
    });
  });
});
