const express = require('express');
const router = express.Router();
const workflowRunController = require('../controllers/workflowRunController');

router.get('/runs', workflowRunController.getWorkflowRuns);
router.get('/runs/:id', workflowRunController.getWorkflowRunDetails);

router.get('/branches', workflowRunController.getBranchesWithRuns);
router.get('/pipeline-data', workflowRunController.getPipelineData);
router.get('/pipeline-stats', workflowRunController.getPipelineStats);

module.exports = router;