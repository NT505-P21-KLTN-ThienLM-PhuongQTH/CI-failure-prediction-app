const express = require('express');
const router = express.Router();
const commitController = require('../controllers/commitController');

router.get('/', commitController.getUserCommits);
router.get('/recent', commitController.getRecentCommits);

module.exports = router;