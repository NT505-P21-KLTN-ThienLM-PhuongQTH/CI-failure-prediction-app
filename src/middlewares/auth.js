const jwt = require("jsonwebtoken");
const { jwtConfig } = require("../config");

const authenticateToken = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1]; // Bearer <token>
    if (!token) return res.status(401).json({ message: 'Authentication required' }) // Unauthorized

    jwt.verify(token, jwtConfig.secret, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' }); // Forbidden
        req.user = user;
        next();
    });
};

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal server error', error: err.message });
}

module.exports = {
    authenticateToken,
    errorHandler
};