const express = require('express');
const router = express.Router();
const modelController = require('../controllers/mlModelController');

router.get('/all', modelController.getAllModels);
router.get('/current', modelController.getCurrentModel);
router.get('/', modelController.getModelInfo);

module.exports = router;