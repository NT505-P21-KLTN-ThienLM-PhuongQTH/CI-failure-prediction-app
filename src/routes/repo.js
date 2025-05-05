const express = require('express');
const router = express.Router();
const repoController = require('../controllers/repoController');
const { restrictToRepoOwner } = require('../middlewares/repoAuth');

router.post('/', repoController.addRepo);
router.get('/', repoController.getUserRepos);
router.put('/:id', restrictToRepoOwner(), repoController.updateRepo);
router.delete('/:id', restrictToRepoOwner(), repoController.deleteRepo);

module.exports = router;