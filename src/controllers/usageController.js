const usageAnalyticsService = require('../services/usageAnalyticsService');
const logger = require('../utils/logger');

/**
 * Usage Controller for handling usage analytics and statistics
 */
class UsageController {
  /**
   * Get usage statistics for the authenticated user
   * GET /usage/stats
   */
  async getUserUsageStats(req, res) {
    try {
      const userId = req.user.id;
      const {
        start_date,
        end_date,
        group_by = 'day'
      } = req.query;

      const options = {
        groupBy: group_by
      };

      if (start_date) {
        options.startDate = new Date(start_date);
      }
      if (end_date) {
        options.endDate = new Date(end_date);
      }

      const stats = await usageAnalyticsService.getUserUsageStats(userId, options);

      logger.info('User usage stats retrieved', {
        userId,
        dateRange: options
      });

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving user usage stats', {
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'USAGE_STATS_ERROR',
          message: 'Failed to retrieve usage statistics'
        }
      });
    }
  }

  /**
   * Get usage statistics for a specific conversation
   * GET /conversations/:id/usage
   */
  async getConversationUsageStats(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      // Note: Access control is handled by the conversation ownership check in the service
      const stats = await usageAnalyticsService.getConversationUsageStats(conversationId);

      logger.info('Conversation usage stats retrieved', {
        conversationId,
        userId
      });

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving conversation usage stats', {
        conversationId: req.params.conversationId,
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'CONVERSATION_USAGE_STATS_ERROR',
          message: 'Failed to retrieve conversation usage statistics'
        }
      });
    }
  }

  /**
   * Get system-wide usage statistics (admin only)
   * GET /usage/system
   */
  async getSystemUsageStats(req, res) {
    try {
      // Check if user has admin privileges
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin privileges required'
          }
        });
      }

      const {
        start_date,
        end_date
      } = req.query;

      const options = {};

      if (start_date) {
        options.startDate = new Date(start_date);
      }
      if (end_date) {
        options.endDate = new Date(end_date);
      }

      const stats = await usageAnalyticsService.getSystemUsageStats(options);

      logger.info('System usage stats retrieved', {
        adminUserId: req.user.id,
        dateRange: options
      });

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving system usage stats', {
        adminUserId: req.user?.id,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'SYSTEM_USAGE_STATS_ERROR',
          message: 'Failed to retrieve system usage statistics'
        }
      });
    }
  }

  /**
   * Get usage summary for dashboard
   * GET /usage/summary
   */
  async getUsageSummary(req, res) {
    try {
      const userId = req.user.id;

      // Get last 7 days stats
      const weeklyStats = await usageAnalyticsService.getUserUsageStats(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      });

      // Get last 30 days stats
      const monthlyStats = await usageAnalyticsService.getUserUsageStats(userId, {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      });

      const summary = {
        weekly: {
          totalTokens: weeklyStats.totalUsage.totalTokens,
          totalRequests: weeklyStats.totalUsage.freeModelRequests + weeklyStats.totalUsage.paidModelRequests,
          totalCost: weeklyStats.totalUsage.totalCost,
          freeModelUsage: weeklyStats.totalUsage.freeModelRequests
        },
        monthly: {
          totalTokens: monthlyStats.totalUsage.totalTokens,
          totalRequests: monthlyStats.totalUsage.freeModelRequests + monthlyStats.totalUsage.paidModelRequests,
          totalCost: monthlyStats.totalUsage.totalCost,
          freeModelUsage: monthlyStats.totalUsage.freeModelRequests
        },
        topModels: monthlyStats.modelBreakdown
          .sort((a, b) => (b.freeModelRequests + b.paidModelRequests) - (a.freeModelRequests + a.paidModelRequests))
          .slice(0, 5)
      };

      logger.info('Usage summary retrieved', {
        userId
      });

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Error retrieving usage summary', {
        userId: req.user?.id,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'USAGE_SUMMARY_ERROR',
          message: 'Failed to retrieve usage summary'
        }
      });
    }
  }
}

module.exports = new UsageController();
