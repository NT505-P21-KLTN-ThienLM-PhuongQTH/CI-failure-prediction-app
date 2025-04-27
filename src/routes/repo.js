const express = require('express');
const router = express.Router();
const repoController = require('../controllers/repoController');

router.post('/', repoController.addRepo);
router.get('/', repoController.getUserRepos);
router.put('/:id', repoController.updateRepo);
router.delete('/:id', repoController.deleteRepo);

module.exports = router;