const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
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
  sender_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'sender_type',
    validate: {
      isIn: [['user', 'assistant', 'system']]
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, parseInt(process.env.MAX_MESSAGE_LENGTH || '10000')]
    }
  },
  content_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'text',
    field: 'content_type',
    validate: {
      isIn: [['text', 'image', 'file']]
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  parent_message_id: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_message_id'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'messages',
  schema: 'chat',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // Messages are immutable
  underscored: true,
  indexes: [
    {
      fields: ['conversation_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['sender_type']
    },
    {
      fields: ['parent_message_id']
    }
  ]
});

// Define associations
Message.associate = (models) => {
  // A message belongs to a conversation
  Message.belongsTo(models.Conversation, {
    foreignKey: 'conversation_id',
    as: 'conversation'
  });

  // A message can have a parent message (for threading)
  Message.belongsTo(Message, {
    foreignKey: 'parent_message_id',
    as: 'parent_message'
  });

  // A message can have child messages (replies)
  Message.hasMany(Message, {
    foreignKey: 'parent_message_id',
    as: 'replies'
  });

  // A message has usage tracking records
  Message.hasMany(models.UsageTracking, {
    foreignKey: 'message_id',
    as: 'usage_tracking'
  });
};

// Instance methods
Message.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  
  // Convert timestamp to ISO string for consistency
  if (values.created_at) {
    values.created_at = values.created_at.toISOString();
  }
  
  return values;
};

// Class methods
Message.findByConversationId = function(conversationId, options = {}) {
  return this.findAll({
    where: {
      conversation_id: conversationId
    },
    order: [['created_at', 'ASC']],
    limit: options.limit || 100,
    offset: options.offset || 0,
    include: options.includeReplies ? [
      {
        model: Message,
        as: 'replies',
        order: [['created_at', 'ASC']]
      }
    ] : [],
    ...options
  });
};

Message.findLatestByConversationId = function(conversationId, limit = 10) {
  return this.findAll({
    where: {
      conversation_id: conversationId
    },
    order: [['created_at', 'DESC']],
    limit
  });
};

Message.countByConversationId = function(conversationId) {
  return this.count({
    where: {
      conversation_id: conversationId
    }
  });
};

module.exports = Message;
