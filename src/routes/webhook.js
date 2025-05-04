const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Middleware để xử lý Content-Type không chính xác
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

router.post(
  "/",
  express.json(),
  parseGitHubPayload,
  webhookController.verifyWebhook,
  webhookController.handleWebhook
);
router.post("/configure", webhookController.configureWebhook);
router.post("/update", webhookController.updateWebhook);
router.post("/delete", webhookController.deleteWebhook);
router.get("/check", webhookController.checkWebhook);
router.get("/list", webhookController.listWebhooks);

module.exports = router;