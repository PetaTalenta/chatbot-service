const express = require('express');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { getMetrics } = require('../middleware/metrics');
const pkg = require('../../package.json');

const router = express.Router();

/**
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: pkg.version,
      environment: process.env.NODE_ENV || 'development',
      service: 'chatbot-service',
      services: {
        database: await checkDatabaseHealth()
      },
      system: {
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    // Determine overall health status based on critical services
    const criticalServices = ['database'];
    const hasCriticalFailure = criticalServices.some(serviceName => {
      const service = health.services[serviceName];
      return service && (service.status === 'unhealthy' || service.status === 'critical');
    });

    if (hasCriticalFailure) {
      health.status = 'unhealthy';
      res.status(503); // Service Unavailable
    } else {
      health.status = 'healthy';
      res.status(200);
    }

    const duration = Date.now() - startTime;
    health.responseTime = `${duration}ms`;

    logger.debug('Health check completed', {
      status: health.status,
      duration,
      services: Object.keys(health.services).map(key => ({
        name: key,
        status: health.services[key].status
      }))
    });

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message
    });

    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      uptime: process.uptime(),
      service: 'chatbot-service'
    });
  }
});

/**
 * Readiness probe endpoint
 */
router.get('/ready', async (req, res) => {
  try {
    const dbHealthy = await checkDatabaseHealth();

    if (dbHealthy.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        service: 'chatbot-service'
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not available',
        service: 'chatbot-service'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message,
      service: 'chatbot-service'
    });
  }
});

/**
 * Liveness probe endpoint
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'chatbot-service'
  });
});

/**
 * Check database health
 */
async function checkDatabaseHealth() {
  try {
    await sequelize.authenticate();
    
    // Get connection pool status if available
    const poolStatus = sequelize.connectionManager?.pool;
    
    return {
      status: 'healthy',
      connected: true,
      pool: poolStatus ? {
        total: poolStatus.options?.max || 'unknown',
        available: poolStatus.available || 'unknown',
        using: poolStatus.using || 'unknown'
      } : null
    };
  } catch (error) {
    return {
      status: 'critical',
      connected: false,
      error: error.message
    };
  }
}

/**
 * Metrics endpoint
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = getMetrics();

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get metrics', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: 'Failed to retrieve metrics'
      }
    });
  }
});

module.exports = router;
