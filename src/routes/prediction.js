const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { authenticateToken } = require('../middlewares/auth');

router.post('/', predictionController.savePrediction);
router.put('/actual', predictionController.updateActualResult);
router.get('/', predictionController.getPredictions);
router.get('/batch', predictionController.getBatchPredictions);
router.get('/results/:id', authenticateToken, predictionController.getPredictionResultById);
router.get('/latest', authenticateToken, predictionController.getLatestPrediction);

module.exports = router;