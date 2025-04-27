const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const authenticateToken = require('../middlewares/auth');

router.post('/workflow-run', authenticateToken, webhookController.handleWorkflowRun);

module.exports = router;