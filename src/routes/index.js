const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const authenticateToken = require('../middlewares/auth');

router.use('/auth', authRoutes);

// router.get('/profile', authenticateToken, (req, res) => {
//     res.status(200).json({ message: 'Protected route accessed', user: req.user });
// });

module.exports = router;