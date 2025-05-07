const express = require('express');
const router = express.Router();
const workflowRunController = require('../controllers/workflowRunController');

router.get('/branches', workflowRunController.getBranchesWithRuns);
router.get('/pipeline-data', workflowRunController.getPipelineData);
router.get('/pipeline-stats', workflowRunController.getPipelineStats);

module.exports = router;