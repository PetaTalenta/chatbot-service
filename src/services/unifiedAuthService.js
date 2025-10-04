const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const AUTH_V2_SERVICE_URL = process.env.AUTH_V2_SERVICE_URL || 'http://localhost:3008';
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Create axios instances
const authClient = axios.create({
  baseURL: AUTH_SERVICE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

const authV2Client = axios.create({
  baseURL: AUTH_V2_SERVICE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Detect token type (JWT or Firebase)
 * @param {String} token - Token to detect
 * @returns {String} - 'jwt' or 'firebase'
 */
const detectTokenType = (token) => {
  try {
    // Try to decode as JWT without verification
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      // If can't decode as JWT, assume it's Firebase
      return 'firebase';
    }
    
    // Check if it has JWT structure (header, payload, signature)
    if (decoded.header && decoded.payload) {
      // Check if it's a Firebase token by looking at the issuer
      if (decoded.payload.iss && decoded.payload.iss.includes('securetoken.google.com')) {
        return 'firebase';
      }
      
      // Check if it has typical JWT fields from our auth-service
      if (decoded.payload.id || decoded.payload.userId) {
        return 'jwt';
      }
    }
    
    // Default to firebase for longer tokens
    if (token.length > 500) {
      return 'firebase';
    }
    
    return 'jwt';
  } catch (error) {
    // If any error, assume firebase
    logger.debug('Token type detection error, assuming firebase', { error: error.message });
    return 'firebase';
  }
};

/**
 * Verify JWT token with old auth-service
 * @param {String} token - JWT token
 * @returns {Promise<Object|null>} - User object or null
 */
const verifyJwtToken = async (token) => {
  try {
    // First verify the JWT signature locally
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    logger.debug('JWT token verified successfully (local)', {
      userId: decoded.id,
      email: decoded.email,
      tokenType: 'jwt'
    });

    return {
      id: decoded.id,
      email: decoded.email,
      user_type: decoded.user_type || 'user',
      username: decoded.username || decoded.email,
      auth_provider: 'local',
      tokenType: 'jwt'
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      logger.debug('JWT token verification failed', { error: error.message });
      return null;
    }
    
    logger.error('JWT token verification error', { error: error.message });
    return null;
  }
};

/**
 * Verify Firebase token with auth-v2-service
 * @param {String} token - Firebase token
 * @returns {Promise<Object|null>} - User object or null
 */
const verifyFirebaseToken = async (token) => {
  try {
    const response = await authV2Client.post('/v1/token/verify', {
      token: token
    });

    if (response.data.success && response.data.data.valid && response.data.data.user) {
      const user = response.data.data.user;
      
      logger.debug('Firebase token verified successfully', {
        userId: user.id,
        email: user.email,
        tokenType: 'firebase'
      });

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        user_type: user.user_type,
        is_active: user.is_active,
        token_balance: user.token_balance,
        auth_provider: user.auth_provider,
        firebase_uid: user.firebase_uid,
        tokenType: 'firebase'
      };
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      logger.debug('Firebase token verification failed', { error: error.message });
      return null;
    }
    
    if (error.request) {
      logger.error('Auth-v2 service unreachable', { error: error.message });
      // Fallback: Don't throw error, return null to allow JWT fallback
      return null;
    }
    
    logger.error('Firebase token verification error', { error: error.message });
    return null;
  }
};

/**
 * Unified token verification - supports both JWT and Firebase tokens
 * @param {String} token - Token to verify
 * @returns {Promise<Object|null>} - User object or null
 */
const verifyToken = async (token) => {
  try {
    // Detect token type
    const tokenType = detectTokenType(token);
    
    logger.debug('Token type detected', { tokenType, tokenLength: token.length });
    
    // Try to verify based on detected type
    if (tokenType === 'firebase') {
      const user = await verifyFirebaseToken(token);
      if (user) return user;
      
      // Fallback to JWT if Firebase verification fails
      logger.debug('Firebase verification failed, trying JWT fallback');
      return await verifyJwtToken(token);
    } else {
      const user = await verifyJwtToken(token);
      if (user) return user;
      
      // Fallback to Firebase if JWT verification fails
      logger.debug('JWT verification failed, trying Firebase fallback');
      return await verifyFirebaseToken(token);
    }
  } catch (error) {
    logger.error('Token verification error', { error: error.message });
    throw error;
  }
};

module.exports = {
  verifyToken,
  detectTokenType
};

