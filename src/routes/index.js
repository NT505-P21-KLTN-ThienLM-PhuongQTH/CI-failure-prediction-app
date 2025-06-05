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
const commitRoutes = require('./commit');
const mlModelRoutes = require('./mlModel');
const predictionRoutes = require('./prediction');
const reportRoutes = require('./report');

router.use('/auth', authRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/ml_model', mlModelRoutes);
router.use('/prediction', predictionRoutes);
router.use('/report', reportRoutes)
router.use('/user', userRoutes);
router.use(authenticateToken);
router.use('/userdata', userDataRoutes);
router.use('/repos', repoRoutes);
router.use('/repodata', repoDataRoutes);
router.use('/workflow', workflowRoutes);
router.use('/workflow_run', workflowRunRoutes);
router.use('/commits', commitRoutes);

module.exports = router;