// middleware/auth.js
const jwt = require("jsonwebtoken");
const { jwtConfig } = require("../config");
const User = require("../models/User");

const authenticateToken = (req, res, next) => {
  const logPrefix = "[authenticateToken]";
  const token = req.headers["authorization"]?.split(" ")[1]; // Bearer <token>
  if (!token) {
    console.log(`${logPrefix} No token provided`);
    return res.status(401).json({ message: "Authentication required" }); // Unauthorized
  }

  jwt.verify(token, jwtConfig.secret, (err, user) => {
    if (err) {
      console.log(`${logPrefix} Invalid token: ${err.message}`);
      return res.status(403).json({ message: "Invalid token" }); // Forbidden
    }
    req.user = user; // Gán thông tin user (giả sử user chứa id và role)
    next();
  });
};

// Middleware kiểm tra vai trò
const restrictTo = (...roles) => {
  return async (req, res, next) => {
    const logPrefix = "[restrictTo]";
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      if (!user) {
        console.log(`${logPrefix} User not found for id ${userId}`);
        return res.status(404).json({ error: "User not found" });
      }

      if (!roles.includes(user.role)) {
        console.log(`${logPrefix} Access denied for user ${userId}, role: ${user.role}`);
        return res.status(403).json({ error: "You do not have permission to perform this action" });
      }

      next();
    } catch (error) {
      console.error(`${logPrefix} Error: ${error.message}`);
      next(error);
    }
  };
};

// Middleware giới hạn truy cập dữ liệu của chính người dùng
const restrictToSelf = () => {
  return async (req, res, next) => {
    const logPrefix = "[restrictToSelf]";
    try {
      const userId = req.user.id;
      const targetUserId = req.params.user_id;

      const user = await User.findById(userId);
      if (!user) {
        console.log(`${logPrefix} User not found for id ${userId}`);
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role !== "admin" && userId !== targetUserId) {
        console.log(`${logPrefix} Access denied for user ${userId} to access data of user ${targetUserId}`);
        return res.status(403).json({ error: "You can only access your own data" });
      }

      next();
    } catch (error) {
      console.error(`${logPrefix} Error: ${error.message}`);
      next(error);
    }
  };
};

module.exports = { authenticateToken, restrictTo, restrictToSelf };