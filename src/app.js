const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Load environment variables
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { collectHttpMetrics } = require('./middleware/metrics');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const usageRoutes = require('./routes/usage');
const healthRoutes = require('./routes/health');


const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// General API rate limiting
app.use(apiLimiter);

// Body parsing middleware
app.use(express.json({ 
  limit: process.env.MAX_MESSAGE_LENGTH ? `${process.env.MAX_MESSAGE_LENGTH}kb` : '10mb' 
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Request ID middleware
app.use((req, res, next) => {
  req.id = require('uuid').v4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Metrics collection middleware
app.use(collectHttpMetrics);

// Routes
app.use('/conversations', conversationRoutes);
app.use('/conversations/:conversationId/messages', messageRoutes);
app.use('/usage', usageRoutes);
app.use('/health', healthRoutes);



// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ATMA Chatbot Service is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    service: 'chatbot-service'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;
