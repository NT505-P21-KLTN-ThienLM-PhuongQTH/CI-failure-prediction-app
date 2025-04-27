const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/auth');
const authRoutes = require('./auth');
const repoRoutes = require('./repo');
const workflowRoutes = require('./workflow');
const webhookRoutes = require('./webhook');
const webhookUserRoutes = require('./webhookUser');

router.use('/auth', authRoutes);
router.use('/repos', repoRoutes);
router.use('/', workflowRoutes);
router.use('/webhook-user', webhookUserRoutes);
router.use('/webhook', webhookRoutes);

module.exports = router;