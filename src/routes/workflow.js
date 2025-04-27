const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');

router.get('/branches', workflowController.getBranchesWithRuns);
// router.get('/dashboard-stats', workflowController.getDashboardStats);
router.get('/pipeline-data', workflowController.getPipelineData);

module.exports = router;