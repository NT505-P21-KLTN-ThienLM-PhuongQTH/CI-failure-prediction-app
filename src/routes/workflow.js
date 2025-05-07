const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');

router.get('/', workflowController.getWorkflows);
router.get('/:id', workflowController.getWorkflowDetails);

module.exports = router;