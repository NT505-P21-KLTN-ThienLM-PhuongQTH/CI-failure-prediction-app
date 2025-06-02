const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.post('/', reportController.reportToAdmin);
router.post('/:reportId/action', reportController.handleAdminAction);
router.get('/', reportController.getAllReports);
router.delete('/:reportId', reportController.deleteReport);

module.exports = router;