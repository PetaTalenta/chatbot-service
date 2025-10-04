const { validateBody, validateQuery, schemas } = require('../../src/middleware/validation');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      path: '/test',
      method: 'POST',
      id: 'test-request-id'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('validateBody', () => {
    it('should pass validation with valid data', () => {
      req.body = {
        title: 'Test Conversation',
        context_type: 'general'
      };

      const middleware = validateBody(schemas.createConversation);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail validation with invalid data', () => {
      req.body = {
        title: 'a'.repeat(300), // Too long
        context_type: 'invalid_type'
      };

      const middleware = validateBody(schemas.createConversation);
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR'
          })
        })
      );
    });

    it('should strip unknown fields', () => {
      req.body = {
        title: 'Test',
        unknown_field: 'should be removed'
      };

      const middleware = validateBody(schemas.createConversation);
      middleware(req, res, next);

      expect(req.body).not.toHaveProperty('unknown_field');
      expect(req.body.title).toBe('Test');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    it('should validate query parameters correctly', () => {
      req.query = {
        page: '2',
        limit: '10',
        include_archived: 'true'
      };

      const middleware = validateQuery(schemas.getConversationsQuery);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(2); // Should be converted to number
      expect(req.query.limit).toBe(10);
    });

    it('should apply default values', () => {
      req.query = {};

      const middleware = validateQuery(schemas.getConversationsQuery);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(1);
      expect(req.query.limit).toBe(20);
      expect(req.query.include_archived).toBe('false');
    });
  });

  describe('schemas', () => {
    describe('createConversation', () => {
      it('should validate valid conversation data', () => {
        const validData = {
          title: 'Test Conversation',
          context_type: 'assessment',
          context_data: { key: 'value' },
          metadata: { meta: 'data' }
        };

        const { error } = schemas.createConversation.validate(validData);
        expect(error).toBeUndefined();
      });

      it('should reject invalid context_type', () => {
        const invalidData = {
          context_type: 'invalid_type'
        };

        const { error } = schemas.createConversation.validate(invalidData);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('Context type must be one of');
      });
    });

    describe('updateConversation', () => {
      it('should validate update data', () => {
        const validData = {
          title: 'Updated Title',
          status: 'archived'
        };

        const { error } = schemas.updateConversation.validate(validData);
        expect(error).toBeUndefined();
      });

      it('should reject invalid status', () => {
        const invalidData = {
          status: 'invalid_status'
        };

        const { error } = schemas.updateConversation.validate(invalidData);
        expect(error).toBeDefined();
      });
    });

    describe('createMessage', () => {
      it('should validate message data', () => {
        const validData = {
          content: 'Test message content',
          sender_type: 'user',
          content_type: 'text'
        };

        const { error } = schemas.createMessage.validate(validData);
        expect(error).toBeUndefined();
      });

      it('should require content and sender_type', () => {
        const invalidData = {};

        const { error } = schemas.createMessage.validate(invalidData);
        expect(error).toBeDefined();
        expect(error.details.some(d => d.path.includes('content'))).toBe(true);
        expect(error.details.some(d => d.path.includes('sender_type'))).toBe(true);
      });

      it('should validate UUID for parent_message_id', () => {
        const invalidData = {
          content: 'Test',
          sender_type: 'user',
          parent_message_id: 'not-a-uuid'
        };

        const { error } = schemas.createMessage.validate(invalidData);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('valid UUID');
      });
    });

    describe('query schemas', () => {
      it('should validate pagination parameters', () => {
        const validQuery = {
          page: 1,
          limit: 50
        };

        const { error } = schemas.getConversationsQuery.validate(validQuery);
        expect(error).toBeUndefined();
      });

      it('should enforce limits', () => {
        const invalidQuery = {
          page: 0,
          limit: 200
        };

        const { error } = schemas.getConversationsQuery.validate(invalidQuery);
        expect(error).toBeDefined();
      });
    });
  });
});
