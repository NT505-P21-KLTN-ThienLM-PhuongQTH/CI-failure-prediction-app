const mongoose = require('mongoose');
const Commit = require('../models/Commit');

exports.getUserCommits = async (req, res, next) => {
    const logPrefix = "[getUserCommits]";
    try {
    // Lấy user_id từ query parameters
    const { user_id } = req.query;

    // Kiểm tra user_id hợp lệ
    if (!user_id) {
        console.log(`${logPrefix} Missing user_id in query`);
        return res.status(400).json({ error: "Missing user_id in query" });
    }

    // Kiểm tra user_id có phải ObjectId hợp lệ
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
        console.log(`${logPrefix} Invalid user_id format: ${user_id}`);
        return res.status(400).json({ error: "Invalid user_id format" });
    }

    // Truy vấn commits của user
    const commits = await Commit.find({ user_id })
      .populate('workflow_run_id', 'name path') // Populate thông tin từ WorkflowRun (tên và path)
      .sort({ createdAt: -1 }) // Sắp xếp theo thời gian tạo, mới nhất trước
      .lean(); // Chuyển sang plain JavaScript object để dễ xử lý

    // Kiểm tra nếu không có commit nào
    if (!commits || commits.length === 0) {
        console.log(`${logPrefix} No commits found for user_id=${user_id}`);
        return res.status(200).json([]);
    }

    // Định dạng dữ liệu trả về cho UI
    const commitList = commits.map((commit) => ({
        id: commit._id.toString(),
        workflow_run_id: commit.workflow_run_id._id.toString(),
        sha: commit.sha,
        commit: {
            author: {
                name: commit.commit.author.name,
                email: commit.commit.author.email,
                date: commit.commit.author.date,
            },
            message: commit.commit.message,
        },
        author: {
            login: commit.author.login,
            avatar_url: commit.author.avatar_url,
            html_url: commit.author.html_url,
        },
        html_url: commit.html_url,
        stats: {
            total: commit.stats.total,
            additions: commit.stats.additions,
            deletions: commit.stats.deletions,
        },
        created_at: commit.createdAt,
        updated_at: commit.updatedAt,
        }));

    console.log(`${logPrefix} Found ${commitList.length} commits for user_id=${user_id}`);
    res.status(200).json(commitList);
    } catch (error) {
        console.error(`${logPrefix} Error fetching commits: ${error.message}`);
        next(error);
    }
};