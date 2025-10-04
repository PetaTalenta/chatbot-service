const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    validate: {
      notEmpty: true
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'New Conversation',
    validate: {
      len: [1, 255]
    }
  },
  context_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'general',
    field: 'context_type',
    validate: {
      isIn: [['general', 'career_guidance']]
    }
  },
  context_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'context_data'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'archived', 'deleted']]
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'conversations',
  schema: 'chat',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['context_type']
    }
  ]
});

// Define associations
Conversation.associate = (models) => {
  // A conversation has many messages
  Conversation.hasMany(models.Message, {
    foreignKey: 'conversation_id',
    as: 'messages',
    onDelete: 'CASCADE'
  });

  // A conversation has many usage tracking records
  Conversation.hasMany(models.UsageTracking, {
    foreignKey: 'conversation_id',
    as: 'usage_tracking',
    onDelete: 'CASCADE'
  });
};

// Instance methods
Conversation.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  
  // Convert timestamps to ISO strings for consistency
  if (values.created_at) {
    values.created_at = values.created_at.toISOString();
  }
  if (values.updated_at) {
    values.updated_at = values.updated_at.toISOString();
  }
  
  return values;
};

// Class methods
Conversation.findByUserId = function(userId, options = {}) {
  return this.findAll({
    where: {
      user_id: userId,
      status: options.includeArchived ? ['active', 'archived'] : 'active'
    },
    order: [['updated_at', 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0,
    ...options
  });
};

Conversation.findActiveByUserId = function(userId, options = {}) {
  return this.findAll({
    where: {
      user_id: userId,
      status: 'active'
    },
    order: [['updated_at', 'DESC']],
    ...options
  });
};

module.exports = Conversation;
