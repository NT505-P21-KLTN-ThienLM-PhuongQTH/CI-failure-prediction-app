const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/auth');
const authRoutes = require('./auth');
const repoRoutes = require('./repo');
const workflowRoutes = require('./workflow');
const webhookRoutes = require('./webhook');
const userRoutes = require('./user');
const userDataRoutes = require('./userData');

router.use('/auth', authRoutes);
router.use('/repos', repoRoutes);
router.use('/', workflowRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/user', userRoutes);
router.use('/userdata', userDataRoutes);

module.exports = router;