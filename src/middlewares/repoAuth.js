const Repo = require("../models/Repo");

const restrictToRepoOwner = () => {
  return async (req, res, next) => {
    const logPrefix = "[restrictToRepoOwner]";
    try {
      const userId = req.user.id; // Lấy userId từ token (đã được gán bởi authenticateToken)
      const repoId = req.params.id; // Lấy repoId từ params (VD: /repodata/:id)

      // Tìm repo dựa trên repoId
      const repo = await Repo.findById(repoId);
      if (!repo) {
        console.log(`${logPrefix} Repository not found: ${repoId}`);
        return res.status(404).json({ error: "Repository not found" });
      }

      // Kiểm tra quyền: Admin có toàn quyền, user thường chỉ được truy cập repo của chính họ
      if (req.user.role !== "admin" && userId !== repo.user_id.toString()) {
        console.log(`${logPrefix} Access denied for user ${userId} to repo ${repoId} owned by ${repo.user_id}`);
        return res.status(403).json({ error: "You can only access your own repositories" });
      }

      next();
    } catch (error) {
      console.error(`${logPrefix} Error: ${error.message}`);
      next(error);
    }
  };
};

module.exports = { restrictToRepoOwner };