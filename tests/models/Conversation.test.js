// Mock Sequelize before importing the model
const mockSequelize = {
  define: jest.fn(),
  fn: jest.fn(),
  col: jest.fn(),
  Op: {
    gte: Symbol('gte'),
    lte: Symbol('lte')
  }
};

const mockDataTypes = {
  UUID: 'UUID',
  UUIDV4: 'UUIDV4',
  STRING: jest.fn(),
  JSONB: 'JSONB',
  DATE: 'DATE',
  NOW: 'NOW'
};

jest.mock('sequelize', () => ({
  DataTypes: mockDataTypes
}));

jest.mock('../../src/config/database', () => mockSequelize);

describe('Conversation Model', () => {
  let ConversationModel;
  let mockModel;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock the model instance that sequelize.define returns
    mockModel = {
      associate: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      prototype: {
        toJSON: jest.fn()
      }
    };
    
    mockSequelize.define.mockReturnValue(mockModel);
    
    // Import the model after mocking
    ConversationModel = require('../../src/models/Conversation');
  });

  it('should define the model with correct attributes', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith(
      'Conversation',
      expect.objectContaining({
        id: expect.objectContaining({
          type: 'UUID',
          defaultValue: 'UUIDV4',
          primaryKey: true,
          allowNull: false
        }),
        user_id: expect.objectContaining({
          type: 'UUID',
          allowNull: false,
          field: 'user_id'
        }),
        title: expect.objectContaining({
          type: expect.any(Object),
          allowNull: false,
          defaultValue: 'New Conversation'
        }),
        context_type: expect.objectContaining({
          type: expect.any(Object),
          allowNull: false,
          defaultValue: 'general',
          field: 'context_type'
        }),
        status: expect.objectContaining({
          allowNull: false,
          defaultValue: 'active'
        })
      }),
      expect.objectContaining({
        tableName: 'conversations',
        schema: 'chat',
        timestamps: true,
        underscored: true
      })
    );
  });

  it('should have correct validation constraints', () => {
    const defineCall = mockSequelize.define.mock.calls[0];
    const attributes = defineCall[1];

    // Check context_type validation
    expect(attributes.context_type.validate.isIn).toEqual([
      ['general', 'assessment', 'career_guidance']
    ]);

    // Check status validation
    expect(attributes.status.validate.isIn).toEqual([
      ['active', 'archived', 'deleted']
    ]);

    // Check title validation
    expect(attributes.title.validate.len).toEqual([1, 255]);
  });

  it('should define correct table options', () => {
    const defineCall = mockSequelize.define.mock.calls[0];
    const options = defineCall[2];

    expect(options).toMatchObject({
      tableName: 'conversations',
      schema: 'chat',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    });
  });

  it('should define correct indexes', () => {
    const defineCall = mockSequelize.define.mock.calls[0];
    const options = defineCall[2];

    expect(options.indexes).toEqual([
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['context_type'] }
    ]);
  });

  describe('associations', () => {
    it('should define associations correctly', () => {
      const mockModels = {
        Message: { hasMany: jest.fn() },
        UsageTracking: { hasMany: jest.fn() }
      };

      // Mock hasMany method on the model
      ConversationModel.hasMany = jest.fn();

      // Call associate method
      ConversationModel.associate(mockModels);

      expect(ConversationModel.hasMany).toHaveBeenCalledWith(
        mockModels.Message,
        expect.objectContaining({
          foreignKey: 'conversation_id',
          as: 'messages',
          onDelete: 'CASCADE'
        })
      );

      expect(ConversationModel.hasMany).toHaveBeenCalledWith(
        mockModels.UsageTracking,
        expect.objectContaining({
          foreignKey: 'conversation_id',
          as: 'usage_tracking',
          onDelete: 'CASCADE'
        })
      );
    });
  });

  describe('instance methods', () => {
    it('should format toJSON correctly', () => {
      const mockInstance = {
        get: jest.fn().mockReturnValue({
          id: 'test-id',
          title: 'Test',
          created_at: new Date('2023-01-01T00:00:00Z'),
          updated_at: new Date('2023-01-02T00:00:00Z')
        })
      };

      const result = ConversationModel.prototype.toJSON.call(mockInstance);

      expect(result.created_at).toBe('2023-01-01T00:00:00.000Z');
      expect(result.updated_at).toBe('2023-01-02T00:00:00.000Z');
    });
  });

  describe('class methods', () => {
    beforeEach(() => {
      ConversationModel.findAll = jest.fn();
    });

    it('should implement findByUserId', () => {
      const userId = 'test-user-id';
      const options = { limit: 10 };

      ConversationModel.findByUserId(userId, options);

      expect(ConversationModel.findAll).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          status: 'active'
        },
        order: [['updated_at', 'DESC']],
        limit: 10,
        offset: 0,
        ...options
      });
    });

    it('should implement findByUserId with includeArchived', () => {
      const userId = 'test-user-id';
      const options = { includeArchived: true };

      ConversationModel.findByUserId(userId, options);

      expect(ConversationModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id: userId,
            status: ['active', 'archived']
          }
        })
      );
    });

    it('should implement findActiveByUserId', () => {
      const userId = 'test-user-id';

      ConversationModel.findActiveByUserId(userId);

      expect(ConversationModel.findAll).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          status: 'active'
        },
        order: [['updated_at', 'DESC']]
      });
    });
  });
});
