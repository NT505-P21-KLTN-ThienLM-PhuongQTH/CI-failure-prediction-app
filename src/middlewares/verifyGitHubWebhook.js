const crypto = require('crypto');

const verifyGitHubWebhook = (req, res, next) => {
  const logPrefix = '[verifyGitHubWebhook]';
  console.log(`${logPrefix} Verifying GitHub webhook`);

  try {
    // Xác thực webhook từ GitHub
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.WEBHOOK_SECRET;

    if (!signature || !secret) {
      console.warn(`${logPrefix} Missing signature or webhook secret`);
      return res.status(403).json({ error: 'Webhook verification failed', code: 'MISSING_SIGNATURE' });
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

    if (signature !== digest) {
      console.warn(`${logPrefix} Invalid webhook signature`);
      return res.status(403).json({ error: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
    }

    console.log(`${logPrefix} Webhook verified successfully`);
    next();
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    return res.status(500).json({ error: 'Server error during webhook verification', code: 'SERVER_ERROR' });
  }
};

module.exports = verifyGitHubWebhook;