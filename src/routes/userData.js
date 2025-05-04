const express = require('express');
const router = express.Router();
const userDataController = require('../controllers/userDataController');

router.post('/', userDataController.createUserData);
router.get('/:user_id', userDataController.getUserData);
router.put('/:user_id', userDataController.updateUserData);
router.post('/upload-avatar', userDataController.uploadAvatar);

module.exports = router;