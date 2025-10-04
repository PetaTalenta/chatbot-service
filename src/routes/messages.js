const express = require('express');
const messageController = require('../controllers/messageController');
const { validateBody, validateQuery, schemas } = require('../middleware/validation');
const { authenticateToken, setUserContext } = require('../middleware/auth');
const { freeModelLimiter } = require('../middleware/rateLimiter');

const router = express.Router({ mergeParams: true });

/**
 * Message Routes for AI Conversations
 * All routes are prefixed with /conversations/:conversationId/messages
 */

// Send a new message and get AI response
router.post('/',
  authenticateToken,
  setUserContext,
  freeModelLimiter, // Apply free model rate limiting
  validateBody(schemas.sendMessage),
  messageController.sendMessage.bind(messageController)
);

// Get messages for a conversation
router.get('/',
  authenticateToken,
  setUserContext,
  validateQuery(schemas.getMessages),
  messageController.getMessages.bind(messageController)
);

// Regenerate AI response for a specific message
router.post('/:messageId/regenerate',
  authenticateToken,
  setUserContext,
  freeModelLimiter, // Apply rate limiting for regeneration too
  messageController.regenerateResponse.bind(messageController)
);

module.exports = router;
