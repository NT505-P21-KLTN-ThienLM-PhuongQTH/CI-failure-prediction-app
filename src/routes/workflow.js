const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');

router.get("/repo", workflowController.getRepoWorkflows);
router.get('/with-runs', workflowController.getWorkflowsWithRuns);
router.get("/content", workflowController.getWorkflowContent);
router.get('/:id', workflowController.getWorkflowDetails);
router.post("/commit", workflowController.commitWorkflowContent);

module.exports = router;