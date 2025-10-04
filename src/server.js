// Load environment variables
require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const { startMetricsLogging } = require('./middleware/metrics');


const PORT = process.env.PORT || 3006;



/**
 * Initialize services
 */
const initializeServices = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync models (in development only)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      logger.info('Database models synchronized');
    }

    // Start metrics logging
    startMetricsLogging();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Service initialization failed', { error: error.message });
    throw error;
  }
};

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  initializeServices().then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`Chatbot Service started on port ${PORT}`, {
        service: 'chatbot-service',
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);

      try {
        // Close database connection
        await sequelize.close();
        logger.info('Database connection closed');

        // Close server
        server.close(() => {
          logger.info('Process terminated');
          process.exit(0);
        });
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    module.exports = server;
  }).catch((error) => {
    logger.error('Failed to start Chatbot Service', { error: error.message });
    process.exit(1);
  });
} else {
  module.exports = app;
}
