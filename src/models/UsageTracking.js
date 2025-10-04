const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UsageTracking = sequelize.define('UsageTracking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'conversation_id',
    validate: {
      notEmpty: true
    }
  },
  message_id: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'message_id',
    validate: {
      notEmpty: true
    }
  },
  model_used: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'model_used',
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  prompt_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'prompt_tokens',
    validate: {
      min: 0
    }
  },
  completion_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'completion_tokens',
    validate: {
      min: 0
    }
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_tokens',
    validate: {
      min: 0
    }
  },
  cost_credits: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    defaultValue: 0,
    field: 'cost_credits',
    validate: {
      min: 0
    }
  },
  is_free_model: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_free_model'
  },
  processing_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'processing_time_ms',
    validate: {
      min: 0
    }
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'usage_tracking',
  schema: 'chat',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // Usage tracking records are immutable
  underscored: true,
  indexes: [
    {
      fields: ['conversation_id']
    },
    {
      fields: ['message_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['model_used']
    }
  ]
});

// Define associations
UsageTracking.associate = (models) => {
  // Usage tracking belongs to a conversation
  UsageTracking.belongsTo(models.Conversation, {
    foreignKey: 'conversation_id',
    as: 'conversation'
  });

  // Usage tracking belongs to a message
  UsageTracking.belongsTo(models.Message, {
    foreignKey: 'message_id',
    as: 'message'
  });
};

// Instance methods
UsageTracking.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  
  // Convert timestamp to ISO string for consistency
  if (values.created_at) {
    values.created_at = values.created_at.toISOString();
  }
  
  // Convert decimal to number for JSON serialization
  if (values.cost_credits) {
    values.cost_credits = parseFloat(values.cost_credits);
  }
  
  return values;
};

// Class methods
UsageTracking.findByConversationId = function(conversationId, options = {}) {
  return this.findAll({
    where: {
      conversation_id: conversationId
    },
    order: [['created_at', 'DESC']],
    ...options
  });
};

UsageTracking.getTotalUsageByConversation = function(conversationId) {
  return this.findOne({
    where: {
      conversation_id: conversationId
    },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('prompt_tokens')), 'total_prompt_tokens'],
      [sequelize.fn('SUM', sequelize.col('completion_tokens')), 'total_completion_tokens'],
      [sequelize.fn('SUM', sequelize.col('total_tokens')), 'total_tokens'],
      [sequelize.fn('SUM', sequelize.col('cost_credits')), 'total_cost_credits'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_requests']
    ],
    raw: true
  });
};

UsageTracking.getUsageByModel = function(options = {}) {
  const whereClause = {};
  
  if (options.startDate) {
    whereClause.created_at = {
      [sequelize.Op.gte]: options.startDate
    };
  }
  
  if (options.endDate) {
    whereClause.created_at = {
      ...whereClause.created_at,
      [sequelize.Op.lte]: options.endDate
    };
  }

  return this.findAll({
    where: whereClause,
    attributes: [
      'model_used',
      [sequelize.fn('SUM', sequelize.col('prompt_tokens')), 'total_prompt_tokens'],
      [sequelize.fn('SUM', sequelize.col('completion_tokens')), 'total_completion_tokens'],
      [sequelize.fn('SUM', sequelize.col('total_tokens')), 'total_tokens'],
      [sequelize.fn('SUM', sequelize.col('cost_credits')), 'total_cost_credits'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_requests']
    ],
    group: ['model_used'],
    order: [[sequelize.fn('SUM', sequelize.col('total_tokens')), 'DESC']],
    raw: true
  });
};

module.exports = UsageTracking;
