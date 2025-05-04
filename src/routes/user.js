const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.put("/users/:user_id", userController.updateUser);

module.exports = router;