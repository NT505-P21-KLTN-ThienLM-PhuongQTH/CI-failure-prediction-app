const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { authenticateToken } = require('../middlewares/auth');

const parseGitHubPayload = (req, res, next) => {
  if (req.headers["content-type"] === "application/x-www-form-urlencoded" && typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch (error) {
      return res.status(400).json({ error: "Invalid payload format" });
    }
  }
  next();
};

router.post( "/", express.json(), parseGitHubPayload, webhookController.verifyWebhook, webhookController.handleWebhook );
router.use(authenticateToken);
router.post("/configure", webhookController.configureWebhook);
router.post("/update", webhookController.updateWebhook);
router.post("/delete", webhookController.deleteWebhook);
router.get("/check", webhookController.checkWebhook);
router.get("/list", webhookController.listWebhooks);
router.post('/trigger-sync', webhookController.triggerSync);

module.exports = router;