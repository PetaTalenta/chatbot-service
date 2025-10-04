// Test setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'atma_test_db';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock external dependencies
jest.mock('../src/middleware/metrics', () => ({
  collectHttpMetrics: jest.fn((req, res, next) => next()),
  incrementConversationMetric: jest.fn(),
  incrementMessageMetric: jest.fn(),
  getMetrics: jest.fn(() => ({
    requests: { total: 0 },
    conversations: { created: 0 },
    messages: { sent: 0 },
    errors: { total: 0 },
    responseTime: { average: 0 }
  })),
  startMetricsLogging: jest.fn()
}));

// Global test utilities
global.testUtils = {
  createMockUser: () => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    user_type: 'user'
  }),
  
  createMockConversation: () => ({
    id: '660e8400-e29b-41d4-a716-446655440001',
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Conversation',
    context_type: 'general',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  }),
  
  createMockMessage: () => ({
    id: '770e8400-e29b-41d4-a716-446655440002',
    conversation_id: '660e8400-e29b-41d4-a716-446655440001',
    sender_type: 'user',
    content: 'Test message',
    content_type: 'text',
    created_at: new Date()
  })
};

// Setup and teardown
beforeAll(async () => {
  // Any global setup
});

afterAll(async () => {
  // Any global cleanup
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});
