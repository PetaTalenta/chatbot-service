/**
 * Archive Service Integration
 * Service for communicating with Archive Service for assessment data
 */

const axios = require('axios');
const logger = require('../utils/logger');

class ArchiveService {
  constructor() {
    this.archiveServiceUrl = process.env.ARCHIVE_SERVICE_URL || 'http://localhost:3002';
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY || 'internal_service_secret_key_change_in_production';
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.archiveServiceUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service': 'true',
        'X-Service-Key': this.internalServiceKey
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Archive service request', {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        logger.error('Archive service request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Archive service response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        logger.error('Archive service response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          error: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get user's latest completed assessment
   * @param {string} userId - User ID
   * @returns {Object|null} Latest assessment data or null
   */
  async getUserLatestAssessment(userId) {
    try {
      const response = await this.client.get('/archive/results/results', {
        params: {
          page: 1,
          limit: 1,
          status: 'completed',
          sort: 'created_at',
          order: 'desc'
        },
        headers: {
          'X-User-ID': userId // Pass user ID for filtering
        }
      });

      if (response.data.success && response.data.data.results && response.data.data.results.length > 0) {
        const latestResult = response.data.data.results[0];
        
        // Verify the result belongs to the user
        if (latestResult.user_id === userId) {
          logger.info('Latest assessment found for user', {
            userId,
            resultId: latestResult.id,
            assessmentName: latestResult.assessment_name,
            createdAt: latestResult.created_at
          });
          return latestResult;
        } else {
          logger.warn('Latest assessment does not belong to user', {
            userId,
            assessmentUserId: latestResult.user_id
          });
          return null;
        }
      }

      logger.info('No completed assessments found for user', { userId });
      return null;
    } catch (error) {
      logger.error('Failed to fetch user latest assessment', {
        userId,
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Get assessment result by ID
   * @param {string} resultId - Assessment result ID
   * @returns {Object|null} Assessment data or null
   */
  async getAssessmentById(resultId) {
    try {
      const response = await this.client.get(`/archive/results/${resultId}`);

      if (response.data.success && response.data.data) {
        logger.info('Assessment data retrieved successfully', {
          resultId,
          userId: response.data.data.user_id,
          status: response.data.data.status
        });
        return response.data.data;
      }

      logger.warn('Assessment data not found or invalid response', {
        resultId,
        success: response.data.success
      });
      return null;
    } catch (error) {
      logger.error('Failed to fetch assessment data', {
        resultId,
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Validate user access to specific assessment result
   * @param {string} userId - User ID
   * @param {string} resultId - Assessment result ID
   * @returns {Object|null} Assessment data if user has access, null otherwise
   */
  async validateUserAssessmentAccess(userId, resultId) {
    try {
      const assessmentData = await this.getAssessmentById(resultId);
      
      if (!assessmentData) {
        logger.warn('Assessment not found', { userId, resultId });
        return null;
      }

      // Verify user owns this assessment
      if (assessmentData.user_id !== userId) {
        logger.warn('Assessment access denied: user does not own this result', {
          userId,
          resultId,
          assessmentUserId: assessmentData.user_id
        });
        return null;
      }

      return assessmentData;
    } catch (error) {
      logger.error('Error validating user assessment access', {
        userId,
        resultId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get user's assessment results with pagination
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object|null} Paginated results or null
   */
  async getUserAssessments(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status = 'completed',
        sort = 'created_at',
        order = 'desc'
      } = options;

      const response = await this.client.get('/archive/results', {
        params: {
          page,
          limit,
          status,
          sort,
          order
        },
        headers: {
          'X-User-ID': userId
        }
      });

      if (response.data.success) {
        logger.info('User assessments retrieved successfully', {
          userId,
          totalResults: response.data.data.pagination?.total || 0,
          page,
          limit
        });
        return response.data.data;
      }

      logger.warn('Failed to retrieve user assessments', {
        userId,
        success: response.data.success
      });
      return null;
    } catch (error) {
      logger.error('Failed to fetch user assessments', {
        userId,
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Update analysis result with chatbot_id
   * @param {string} resultId - Analysis result ID
   * @param {string} chatbotId - Chatbot conversation ID
   * @returns {Object|null} Updated result or null
   */
  async updateAnalysisResult(resultId, chatbotId) {
    try {
      logger.info('Updating analysis result with chatbot_id', {
        resultId,
        chatbotId
      });

      const response = await this.client.put(`/archive/results/${resultId}`, {
        chatbot_id: chatbotId
      });

      if (response.data.success) {
        logger.info('Analysis result updated successfully', {
          resultId,
          chatbotId
        });
        return response.data.data;
      }

      logger.warn('Failed to update analysis result', {
        resultId,
        chatbotId,
        success: response.data.success
      });
      return null;
    } catch (error) {
      logger.error('Failed to update analysis result', {
        resultId,
        chatbotId,
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }
}

module.exports = new ArchiveService();
