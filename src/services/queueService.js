const amqp = require('amqplib');
const logger = require('../utils/logger');

/**
 * QueueService for RabbitMQ integration
 * Handles connection management, event consumption, and error handling
 */
class QueueService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '10');
    this.reconnectDelay = parseInt(process.env.RABBITMQ_RECONNECT_DELAY || '5000');
    this.connectionTimeout = parseInt(process.env.RABBITMQ_CONNECTION_TIMEOUT || '10000');
    
    // Configuration
    this.config = {
      url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
      exchange: process.env.RABBITMQ_EXCHANGE || 'atma_events',
      queue: process.env.RABBITMQ_QUEUE || 'chatbot_assessment_events',
      routingKey: process.env.RABBITMQ_ROUTING_KEY || 'analysis_complete'
    };

    // Event handlers registry
    this.eventHandlers = new Map();
  }

  /**
   * Initialize RabbitMQ connection and setup
   */
  async initialize() {
    try {
      logger.info('Initializing RabbitMQ connection', {
        url: this.config.url.replace(/\/\/.*@/, '//***:***@'), // Hide credentials in logs
        exchange: this.config.exchange,
        queue: this.config.queue
      });

      await this.connect();
      await this.setupExchangeAndQueue();
      
      logger.info('QueueService initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize QueueService', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Establish connection to RabbitMQ
   */
  async connect() {
    try {
      // Create connection with timeout
      this.connection = await amqp.connect(this.config.url, {
        timeout: this.connectionTimeout
      });

      // Handle connection events
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));

      // Create channel
      this.channel = await this.connection.createChannel();
      
      // Handle channel events
      this.channel.on('error', this.handleChannelError.bind(this));
      this.channel.on('close', this.handleChannelClose.bind(this));

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('RabbitMQ connection established successfully');
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to RabbitMQ', {
        error: error.message,
        attempts: this.reconnectAttempts
      });
      throw error;
    }
  }

  /**
   * Setup exchange and queue
   */
  async setupExchangeAndQueue() {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    try {
      // Assert exchange
      await this.channel.assertExchange(this.config.exchange, 'topic', {
        durable: true
      });

      // Assert queue
      await this.channel.assertQueue(this.config.queue, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // 24 hours TTL
          'x-max-length': 10000 // Max 10k messages
        }
      });

      // Bind queue to exchange
      await this.channel.bindQueue(
        this.config.queue,
        this.config.exchange,
        this.config.routingKey
      );

      logger.info('Exchange and queue setup completed', {
        exchange: this.config.exchange,
        queue: this.config.queue,
        routingKey: this.config.routingKey
      });
    } catch (error) {
      logger.error('Failed to setup exchange and queue', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Subscribe to events with handler
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Event handler function
   */
  async subscribe(eventType, handler) {
    if (!this.isConnected || !this.channel) {
      throw new Error('QueueService not connected');
    }

    try {
      // Register handler
      this.eventHandlers.set(eventType, handler);

      // Start consuming messages
      await this.channel.consume(this.config.queue, async (message) => {
        if (message) {
          await this.handleMessage(message);
        }
      }, {
        noAck: false // Manual acknowledgment
      });

      logger.info('Subscribed to events', {
        eventType,
        queue: this.config.queue
      });
    } catch (error) {
      logger.error('Failed to subscribe to events', {
        eventType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle incoming message
   * @param {Object} message - RabbitMQ message
   */
  async handleMessage(message) {
    try {
      const content = JSON.parse(message.content.toString());
      const eventType = message.fields.routingKey;

      logger.info('Received message', {
        eventType,
        messageId: content.id || 'unknown',
        timestamp: content.timestamp || new Date().toISOString()
      });

      // Get handler for event type
      const handler = this.eventHandlers.get(eventType);
      
      if (handler) {
        // Process message with handler
        await handler(content);
        
        // Acknowledge message
        this.channel.ack(message);
        
        logger.info('Message processed successfully', {
          eventType,
          messageId: content.id || 'unknown'
        });
      } else {
        logger.warn('No handler found for event type', {
          eventType,
          availableHandlers: Array.from(this.eventHandlers.keys())
        });
        
        // Acknowledge message even if no handler (to avoid reprocessing)
        this.channel.ack(message);
      }
    } catch (error) {
      logger.error('Error processing message', {
        error: error.message,
        stack: error.stack
      });

      // Reject message and requeue for retry
      this.channel.nack(message, false, true);
    }
  }

  /**
   * Handle connection errors
   */
  handleConnectionError(error) {
    logger.error('RabbitMQ connection error', {
      error: error.message
    });
    this.isConnected = false;
  }

  /**
   * Handle connection close
   */
  handleConnectionClose() {
    logger.warn('RabbitMQ connection closed');
    this.isConnected = false;
    this.scheduleReconnect();
  }

  /**
   * Handle channel errors
   */
  handleChannelError(error) {
    logger.error('RabbitMQ channel error', {
      error: error.message
    });
  }

  /**
   * Handle channel close
   */
  handleChannelClose() {
    logger.warn('RabbitMQ channel closed');
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;
    
    logger.info('Scheduling reconnection attempt', {
      attempt: this.reconnectAttempts,
      delay: this.reconnectDelay
    });

    setTimeout(async () => {
      try {
        await this.connect();
        await this.setupExchangeAndQueue();
        
        // Re-subscribe to all events
        for (const [eventType, handler] of this.eventHandlers) {
          await this.subscribe(eventType, handler);
        }
      } catch (error) {
        logger.error('Reconnection attempt failed', {
          attempt: this.reconnectAttempts,
          error: error.message
        });
        this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  /**
   * Close connection gracefully
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.isConnected = false;
      logger.info('QueueService closed successfully');
    } catch (error) {
      logger.error('Error closing QueueService', {
        error: error.message
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      config: {
        exchange: this.config.exchange,
        queue: this.config.queue,
        routingKey: this.config.routingKey
      }
    };
  }
}

module.exports = QueueService;
