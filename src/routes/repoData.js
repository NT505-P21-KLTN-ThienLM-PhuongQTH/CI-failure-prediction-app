const express = require('express');
const router = express.Router();
const { restrictToRepoOwner } = require('../middlewares/repoAuth');
const repoDataController = require('../controllers/repoDataController');

router.get("/:id",
    restrictToRepoOwner(),
    repoDataController.getRepoDetails
);

module.exports = router;