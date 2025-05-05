const express = require('express');
const router = express.Router();
const { authenticateToken, restrictTo, restrictToSelf } = require('../middlewares/auth');
const userDataController = require('../controllers/userDataController');

router.use(authenticateToken);

router.post('/',
    restrictToSelf,
    userDataController.createUserData
);
router.get('/:user_id',
    restrictToSelf(),
    userDataController.getUserData
);
router.get("/",
    restrictTo('admin'),
    userDataController.getAllUserData
); // Route cho admin
router.put('/:user_id',
    restrictToSelf(),
    userDataController.updateUserData
);
router.delete("/:user_id",
    restrictToSelf(),
    userDataController.deleteUserData
);
router.post('/upload-avatar',
    restrictToSelf(),
    userDataController.uploadAvatar
);

module.exports = router;