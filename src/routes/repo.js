const express = require('express');
const router = express.Router();
const repoController = require('../controllers/repoController');
const { restrictToRepoOwner } = require('../middlewares/repoAuth');
const { authenticateToken, restrictTo } = require('../middlewares/auth');

router.use(authenticateToken);

router.get('/all', restrictTo('admin'), repoController.getAllUserRepos);
router.post('/', repoController.addRepo);
router.get('/', repoController.getUserRepos);
router.put('/:id', restrictToRepoOwner(), repoController.updateRepo);
router.delete('/:id', restrictToRepoOwner(), repoController.deleteRepo);

module.exports = router;