const sequelize = require('../config/database');
const Conversation = require('./Conversation');
const Message = require('./Message');
const UsageTracking = require('./UsageTracking');

// Initialize models
const models = {
  Conversation,
  Message,
  UsageTracking,
  sequelize
};

// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = models;
