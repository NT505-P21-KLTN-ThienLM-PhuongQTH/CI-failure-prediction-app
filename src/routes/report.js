const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, restrictTo} = require('../middlewares/auth');

router.use(authenticateToken);

router.post('/',  reportController.reportToAdmin);
router.post('/:reportId/action', reportController.handleAdminAction);
router.get('/all', restrictTo('admin'), reportController.getAllReports);
router.delete('/:reportId', reportController.deleteReport);

module.exports = router;