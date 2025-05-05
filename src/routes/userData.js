const express = require('express');
const router = express.Router();
const { authenticateToken, restrictTo, restrictToSelf } = require('../middlewares/auth');
const userDataController = require('../controllers/userDataController');

router.post('/',
    authenticateToken,
    restrictToSelf,
    userDataController.createUserData
);
router.get('/:user_id',
    authenticateToken,
    restrictToSelf(),
    userDataController.getUserData
);
router.get("/",
    authenticateToken,
    restrictTo('admin'),
    userDataController.getAllUserData
); // Route cho admin
router.put('/:user_id',
    authenticateToken,
    restrictToSelf(),
    userDataController.updateUserData
);
router.delete("/:user_id",
    authenticateToken,
    restrictToSelf(),
    userDataController.deleteUserData
);
router.post('/upload-avatar',
    authenticateToken,
    restrictToSelf(),
    userDataController.uploadAvatar
);

module.exports = router;