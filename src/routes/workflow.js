const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');

router.get('/branches', workflowController.getBranchesWithRuns);
router.get('/workflows', workflowController.getWorkflows);
router.get('/workflow-details/:id', workflowController.getWorkflowDetails);
router.get('/pipeline-data', workflowController.getPipelineData);
router.get('/pipeline-stats', workflowController.getPipelineStats);

module.exports = router;