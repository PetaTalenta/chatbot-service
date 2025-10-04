const express = require('express');
const conversationController = require('../controllers/conversationController');
const usageController = require('../controllers/usageController');
const { validateBody, validateQuery, schemas } = require('../middleware/validation');
const { authenticateToken, setUserContext } = require('../middleware/auth');
const { conversationLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Routes
router.post('/',
  authenticateToken,
  setUserContext,
  conversationLimiter,
  validateBody(schemas.createConversation),
  conversationController.createConversation
);

router.get('/',
  authenticateToken,
  setUserContext,
  validateQuery(schemas.getConversationsQuery),
  conversationController.getConversations
);

router.get('/:id',
  authenticateToken,
  setUserContext,
  validateQuery(schemas.getConversationQuery),
  conversationController.getConversation
);

router.put('/:id',
  authenticateToken,
  setUserContext,
  validateBody(schemas.updateConversation),
  conversationController.updateConversation
);

router.delete('/:id',
  authenticateToken,
  setUserContext,
  conversationController.deleteConversation
);


router.get('/:conversationId/usage',
  authenticateToken,
  setUserContext,
  usageController.getConversationUsageStats
);

module.exports = router;
