const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const userDataRoutes = require('./userData');
const repoRoutes = require('./repo');
const repoDataRoutes = require('./repoData');
const workflowRoutes = require('./workflow');
const workflowRunRoutes = require('./workflowRun');
const webhookRoutes = require('./webhook');

router.use('/auth', authRoutes);
router.use(authenticateToken);
router.use('/user', userRoutes);
router.use('/userdata', userDataRoutes);
router.use('/repos', repoRoutes);
router.use('/repodata', repoDataRoutes);
router.use('/workflow', workflowRoutes);
router.use('/workflow_run', workflowRunRoutes);
router.use('/webhooks', webhookRoutes);

module.exports = router;