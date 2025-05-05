const express = require('express');
const router = express.Router();
const repoController = require('../controllers/repoController');
const { authenticateToken, restrictTo } = require('../middlewares/auth');
const { restrictToRepoOwner } = require('../middlewares/repoAuth');

router.use(authenticateToken);

router.post('/', repoController.addRepo);
router.get('/', repoController.getUserRepos);
router.put('/:id', restrictToRepoOwner(), repoController.updateRepo);
router.delete('/:id', restrictToRepoOwner(), repoController.deleteRepo);

module.exports = router;