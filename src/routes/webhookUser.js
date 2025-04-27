const express = require('express');
const router = express.Router();
const WebhookUser = require('../models/WebhookUser');
const authenticateToken = require('../middlewares/auth');

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { webhook_url } = req.body;

    if (!webhook_url) {
      return res.status(400).json({ error: 'Webhook URL is required', code: 'MISSING_WEBHOOK_URL' });
    }

    const webhookUser = await WebhookUser.findOneAndUpdate(
      { user_id },
      { user_id, webhook_url, created_at: new Date() },
      { upsert: true, new: true }
    );

    res.status(201).json(webhookUser);
  } catch (error) {
    next(error);
  }
});

module.exports = router;