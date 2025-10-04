const jwt = require('jsonwebtoken');
const { authenticateToken, authenticateInternalService, verifyToken } = require('../../src/middleware/auth');

// Mock jwt
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      originalUrl: '/test',
      id: 'test-request-id'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    
    // Reset JWT mock
    jwt.verify.mockReset();
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const mockPayload = { id: 'user-id', email: 'test@example.com' };
      jwt.verify.mockReturnValue(mockPayload);

      const result = verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
    });

    it('should throw error for expired token', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyToken('expired-token')).toThrow('Token has expired');
    });

    it('should throw error for invalid token', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyToken('invalid-token')).toThrow('Invalid token format');
    });
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      req.headers.authorization = 'Bearer valid-token';
      const mockPayload = { 
        id: 'user-id', 
        email: 'test@example.com',
        user_type: 'user'
      };
      jwt.verify.mockReturnValue(mockPayload);

      await authenticateToken(req, res, next);

      expect(req.user).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        user_type: 'user'
      });
      expect(req.token).toBe('valid-token');
      expect(next).toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
            message: 'Access token is required'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      req.headers.authorization = 'InvalidFormat';

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle expired token', async () => {
      req.headers.authorization = 'Bearer expired-token';
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOKEN_EXPIRED'
          })
        })
      );
    });

    it('should handle token without user ID', async () => {
      req.headers.authorization = 'Bearer token-without-id';
      jwt.verify.mockReturnValue({ email: 'test@example.com' }); // No id field

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid token payload'
          })
        })
      );
    });
  });

  describe('authenticateInternalService', () => {
    beforeEach(() => {
      process.env.INTERNAL_SERVICE_KEY = 'test-service-key';
    });

    it('should authenticate valid internal service request', () => {
      req.headers['x-internal-service'] = 'true';
      req.headers['x-service-key'] = 'test-service-key';

      authenticateInternalService(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request without internal service header', () => {
      req.headers['x-service-key'] = 'test-service-key';

      authenticateInternalService(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Internal service access required'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid service key', () => {
      req.headers['x-internal-service'] = 'true';
      req.headers['x-service-key'] = 'invalid-key';

      authenticateInternalService(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid service key'
          })
        })
      );
    });

    it('should reject request without service key', () => {
      req.headers['x-internal-service'] = 'true';

      authenticateInternalService(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
