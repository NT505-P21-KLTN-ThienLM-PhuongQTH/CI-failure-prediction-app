const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');

router.post('/', predictionController.savePrediction);
router.put('/actual', predictionController.updateActualResult);
router.get('/', predictionController.getPredictions);
router.get('/batch', predictionController.getBatchPredictions);

module.exports = router;