const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post("/", userController.createUser);
router.put("/:user_id", userController.updateUser);

module.exports = router;