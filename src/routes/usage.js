const express = require('express');
const usageController = require('../controllers/usageController');
const { validateQuery, schemas } = require('../middleware/validation');
const { authenticateToken, setUserContext } = require('../middleware/auth');

const router = express.Router();

/**
 * Usage Analytics Routes
 * All routes require authentication
 */

// Get user usage statistics
router.get('/stats',
  authenticateToken,
  setUserContext,
  validateQuery(schemas.usageStatsQuery),
  usageController.getUserUsageStats
);

// Get usage summary for dashboard
router.get('/summary',
  authenticateToken,
  setUserContext,
  usageController.getUsageSummary
);

// Get system-wide usage statistics (admin only)
router.get('/system',
  authenticateToken,
  setUserContext,
  validateQuery(schemas.systemUsageQuery),
  usageController.getSystemUsageStats
);

module.exports = router;
