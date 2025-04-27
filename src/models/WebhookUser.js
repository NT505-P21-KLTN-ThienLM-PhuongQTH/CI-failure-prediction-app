const mongoose = require('mongoose');

const WebhookUserSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  webhook_url: { type: String, required: true }, // URL webhook mà user cấu hình trên GitHub
  created_at: { type: Date, default: Date.now }
});

// WebhookUserSchema.index({ user_id: 1, webhook_url: 1 });

module.exports = mongoose.model('WebhookUser', WebhookUserSchema, 'webhook_users');