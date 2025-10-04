const { UsageTracking, Conversation, Message } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Usage Analytics Service for tracking and analyzing AI model usage
 * Provides insights into token consumption, costs, and performance metrics
 */
class UsageAnalyticsService {
  /**
   * Get usage statistics for a specific user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Usage statistics
   */
  async getUserUsageStats(userId, options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        endDate = new Date(),
        groupBy = 'day' // day, week, month
      } = options;

      // Get conversations for the user
      const conversations = await Conversation.findAll({
        where: { user_id: userId },
        attributes: ['id']
      });

      const conversationIds = conversations.map(c => c.id);

      if (conversationIds.length === 0) {
        return {
          totalUsage: this.getEmptyUsageStats(),
          timeline: [],
          modelBreakdown: [],
          costAnalysis: this.getEmptyCostAnalysis()
        };
      }

      // Get usage tracking data
      const usageData = await UsageTracking.findAll({
        where: {
          conversation_id: { [Op.in]: conversationIds },
          created_at: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['created_at', 'ASC']]
      });

      // Calculate total usage statistics
      const totalUsage = this.calculateTotalUsage(usageData);

      // Generate timeline data
      const timeline = this.generateTimeline(usageData, groupBy, startDate, endDate);

      // Generate model breakdown
      const modelBreakdown = this.generateModelBreakdown(usageData);

      // Calculate cost analysis
      const costAnalysis = this.calculateCostAnalysis(usageData);

      logger.info('User usage stats calculated', {
        userId,
        totalConversations: conversationIds.length,
        totalRequests: usageData.length,
        dateRange: { startDate, endDate }
      });

      return {
        totalUsage,
        timeline,
        modelBreakdown,
        costAnalysis,
        metadata: {
          userId,
          dateRange: { startDate, endDate },
          totalConversations: conversationIds.length,
          totalRequests: usageData.length
        }
      };

    } catch (error) {
      logger.error('Error calculating user usage stats', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get usage statistics for a specific conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Object} Conversation usage statistics
   */
  async getConversationUsageStats(conversationId) {
    try {
      const usageData = await UsageTracking.findAll({
        where: { conversation_id: conversationId },
        include: [{
          model: Message,
          as: 'message',
          attributes: ['id', 'sender_type', 'created_at']
        }],
        order: [['created_at', 'ASC']]
      });

      const totalUsage = this.calculateTotalUsage(usageData);
      const modelBreakdown = this.generateModelBreakdown(usageData);
      const messageStats = this.calculateMessageStats(usageData);

      return {
        conversationId,
        totalUsage,
        modelBreakdown,
        messageStats,
        requestCount: usageData.length
      };

    } catch (error) {
      logger.error('Error calculating conversation usage stats', {
        conversationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get system-wide usage statistics
   * @param {Object} options - Query options
   * @returns {Object} System usage statistics
   */
  async getSystemUsageStats(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        endDate = new Date()
      } = options;

      const usageData = await UsageTracking.findAll({
        where: {
          created_at: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['created_at', 'ASC']]
      });

      const totalUsage = this.calculateTotalUsage(usageData);
      const modelBreakdown = this.generateModelBreakdown(usageData);
      const performanceMetrics = this.calculatePerformanceMetrics(usageData);
      const costAnalysis = this.calculateCostAnalysis(usageData);

      // Get unique users and conversations
      const uniqueConversations = new Set(usageData.map(u => u.conversation_id)).size;
      
      return {
        totalUsage,
        modelBreakdown,
        performanceMetrics,
        costAnalysis,
        systemMetrics: {
          totalRequests: usageData.length,
          uniqueConversations,
          dateRange: { startDate, endDate }
        }
      };

    } catch (error) {
      logger.error('Error calculating system usage stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate total usage statistics from usage data
   * @param {Array} usageData - Array of usage tracking records
   * @returns {Object} Total usage statistics
   */
  calculateTotalUsage(usageData) {
    return usageData.reduce((acc, usage) => {
      acc.totalTokens += usage.total_tokens || 0;
      acc.promptTokens += usage.prompt_tokens || 0;
      acc.completionTokens += usage.completion_tokens || 0;
      acc.totalCost += usage.cost_credits || 0;
      acc.freeModelRequests += usage.is_free_model ? 1 : 0;
      acc.paidModelRequests += usage.is_free_model ? 0 : 1;
      acc.totalProcessingTime += usage.processing_time_ms || 0;
      return acc;
    }, this.getEmptyUsageStats());
  }

  /**
   * Generate timeline data grouped by specified period
   * @param {Array} usageData - Usage tracking data
   * @param {string} groupBy - Grouping period (day, week, month)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} Timeline data
   */
  generateTimeline(usageData, groupBy, startDate, endDate) {
    const timeline = new Map();
    
    // Initialize timeline with empty periods
    const current = new Date(startDate);
    while (current <= endDate) {
      const key = this.getTimelineKey(current, groupBy);
      timeline.set(key, this.getEmptyUsageStats());
      
      // Increment by period
      if (groupBy === 'day') current.setDate(current.getDate() + 1);
      else if (groupBy === 'week') current.setDate(current.getDate() + 7);
      else if (groupBy === 'month') current.setMonth(current.getMonth() + 1);
    }

    // Populate timeline with actual data
    usageData.forEach(usage => {
      const key = this.getTimelineKey(usage.created_at, groupBy);
      if (timeline.has(key)) {
        const period = timeline.get(key);
        period.totalTokens += usage.total_tokens || 0;
        period.promptTokens += usage.prompt_tokens || 0;
        period.completionTokens += usage.completion_tokens || 0;
        period.totalCost += usage.cost_credits || 0;
        period.freeModelRequests += usage.is_free_model ? 1 : 0;
        period.paidModelRequests += usage.is_free_model ? 0 : 1;
        period.totalProcessingTime += usage.processing_time_ms || 0;
      }
    });

    return Array.from(timeline.entries()).map(([period, stats]) => ({
      period,
      ...stats
    }));
  }

  /**
   * Generate model usage breakdown
   * @param {Array} usageData - Usage tracking data
   * @returns {Array} Model breakdown statistics
   */
  generateModelBreakdown(usageData) {
    const modelStats = new Map();

    usageData.forEach(usage => {
      const model = usage.model_used;
      if (!modelStats.has(model)) {
        modelStats.set(model, this.getEmptyUsageStats());
      }

      const stats = modelStats.get(model);
      stats.totalTokens += usage.total_tokens || 0;
      stats.promptTokens += usage.prompt_tokens || 0;
      stats.completionTokens += usage.completion_tokens || 0;
      stats.totalCost += usage.cost_credits || 0;
      stats.freeModelRequests += usage.is_free_model ? 1 : 0;
      stats.paidModelRequests += usage.is_free_model ? 0 : 1;
      stats.totalProcessingTime += usage.processing_time_ms || 0;
    });

    return Array.from(modelStats.entries()).map(([model, stats]) => ({
      model,
      isFreeModel: model.includes(':free'),
      ...stats,
      averageProcessingTime: stats.freeModelRequests + stats.paidModelRequests > 0 
        ? stats.totalProcessingTime / (stats.freeModelRequests + stats.paidModelRequests) 
        : 0
    }));
  }

  /**
   * Calculate performance metrics
   * @param {Array} usageData - Usage tracking data
   * @returns {Object} Performance metrics
   */
  calculatePerformanceMetrics(usageData) {
    if (usageData.length === 0) {
      return {
        averageProcessingTime: 0,
        averageTokensPerRequest: 0,
        successRate: 0,
        freeModelUsageRate: 0
      };
    }

    const totalProcessingTime = usageData.reduce((sum, u) => sum + (u.processing_time_ms || 0), 0);
    const totalTokens = usageData.reduce((sum, u) => sum + (u.total_tokens || 0), 0);
    const freeModelRequests = usageData.filter(u => u.is_free_model).length;

    return {
      averageProcessingTime: totalProcessingTime / usageData.length,
      averageTokensPerRequest: totalTokens / usageData.length,
      successRate: 100, // Assuming all tracked requests were successful
      freeModelUsageRate: (freeModelRequests / usageData.length) * 100
    };
  }

  /**
   * Calculate cost analysis
   * @param {Array} usageData - Usage tracking data
   * @returns {Object} Cost analysis
   */
  calculateCostAnalysis(usageData) {
    const totalCost = usageData.reduce((sum, u) => sum + (u.cost_credits || 0), 0);
    const freeModelRequests = usageData.filter(u => u.is_free_model).length;
    const paidModelRequests = usageData.length - freeModelRequests;

    return {
      totalCost,
      freeModelRequests,
      paidModelRequests,
      costSavings: paidModelRequests > 0 ? 
        (freeModelRequests / (freeModelRequests + paidModelRequests)) * 100 : 100,
      averageCostPerRequest: usageData.length > 0 ? totalCost / usageData.length : 0
    };
  }

  /**
   * Calculate message-specific statistics
   * @param {Array} usageData - Usage tracking data with message info
   * @returns {Object} Message statistics
   */
  calculateMessageStats(usageData) {
    const messageCount = usageData.length;
    const avgTokensPerMessage = messageCount > 0 
      ? usageData.reduce((sum, u) => sum + (u.total_tokens || 0), 0) / messageCount 
      : 0;

    return {
      messageCount,
      avgTokensPerMessage,
      avgProcessingTime: messageCount > 0 
        ? usageData.reduce((sum, u) => sum + (u.processing_time_ms || 0), 0) / messageCount 
        : 0
    };
  }

  /**
   * Get timeline key for grouping
   * @param {Date} date - Date to get key for
   * @param {string} groupBy - Grouping period
   * @returns {string} Timeline key
   */
  getTimelineKey(date, groupBy) {
    const d = new Date(date);
    if (groupBy === 'day') {
      return d.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const week = Math.floor(d.getDate() / 7);
      return `${d.getFullYear()}-${d.getMonth() + 1}-W${week}`;
    } else if (groupBy === 'month') {
      return `${d.getFullYear()}-${d.getMonth() + 1}`;
    }
    return d.toISOString().split('T')[0];
  }

  /**
   * Get empty usage statistics object
   * @returns {Object} Empty usage stats
   */
  getEmptyUsageStats() {
    return {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      freeModelRequests: 0,
      paidModelRequests: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Get empty cost analysis object
   * @returns {Object} Empty cost analysis
   */
  getEmptyCostAnalysis() {
    return {
      totalCost: 0,
      freeModelRequests: 0,
      paidModelRequests: 0,
      costSavings: 100,
      averageCostPerRequest: 0
    };
  }
}

module.exports = new UsageAnalyticsService();
