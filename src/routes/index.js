const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const authRoutes = require('./auth');
const repoRoutes = require('./repo');
const workflowRoutes = require('./workflow');
const webhookRoutes = require('./webhook');
const userRoutes = require('./user');
const userDataRoutes = require('./userData');
const repoDataRoutes = require('./repoData');

router.use('/auth', authRoutes);
router.use(authenticateToken);
router.use('/repos', repoRoutes);
router.use('/repodata', repoDataRoutes);
router.use('/', workflowRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/user', userRoutes);
router.use('/userdata', userDataRoutes);

module.exports = router;