const mongoose = require('mongoose');
const Commit = require('../models/Commit');

exports.getUserCommits = async (req, res, next) => {
    const logPrefix = "[getUserCommits]";
    try {
        const { user_id, page = 1, limit = 10 } = req.query;

        if (!user_id) {
            console.log(`${logPrefix} Missing user_id in query`);
            return res.status(400).json({ error: "Missing user_id in query" });
        }

        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            console.log(`${logPrefix} Invalid user_id format: ${user_id}`);
            return res.status(400).json({ error: "Invalid user_id format" });
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);

        if (pageNum < 1 || limitNum < 1) {
            console.log(`${logPrefix} Invalid page or limit: page=${page}, limit=${limit}`);
            return res.status(400).json({ error: "Invalid page or limit" });
        }

        const commits = await Commit.find({ user_id })
            .populate('workflow_run_id', 'name path')
            .sort({ 'commit.author.date': -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        if (!commits || commits.length === 0) {
            console.log(`${logPrefix} No commits found for user_id=${user_id}, page=${pageNum}`);
            return res.status(200).json({
                commits: [],
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: 0
                }
            });
        }

        const totalCommits = await Commit.countDocuments({ user_id });

        const commitList = commits.map((commit) => ({
            id: commit._id.toString(),
            workflow_run_id: commit.workflow_run_id?._id.toString(),
            sha: commit.sha,
            commit: {
                author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email,
                    date: commit.commit.author.date
                },
                message: commit.commit.message
            },
            author: {
                login: commit.author.login,
                avatar_url: commit.author.avatar_url,
                html_url: commit.author.html_url
            },
            html_url: commit.html_url,
            stats: {
                total: commit.stats.total,
                additions: commit.stats.additions,
                deletions: commit.stats.deletions
            }
        }));

        console.log(`${logPrefix} Found ${commitList.length} commits for user_id=${user_id}, page=${pageNum}`);
        res.status(200).json({
            commits: commitList,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCommits
            }
        });
    } catch (error) {
        console.error(`${logPrefix} Error fetching commits: ${error.message}`);
        next(error);
    }
};

exports.getRecentCommits = async (req, res, next) => {
    const logPrefix = "[getRecentCommits]";
    try {
        const { user_id, limit = 5 } = req.query;

        if (!user_id) {
            console.log(`${logPrefix} Missing user_id in query`);
            return res.status(400).json({ error: "Missing user_id in query" });
        }

        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            console.log(`${logPrefix} Invalid user_id format: ${user_id}`);
            return res.status(400).json({ error: "Invalid user_id format" });
        }

        const limitNum = parseInt(limit, 10);

        if (limitNum < 1) {
            console.log(`${logPrefix} Invalid limit: limit=${limit}`);
            return res.status(400).json({ error: "Invalid limit" });
        }

        const commits = await Commit.find({ user_id })
            .populate('workflow_run_id', 'name path')
            .sort({ 'commit.author.date': -1 })
            .limit(limitNum)
            .lean();

        if (!commits || commits.length === 0) {
            console.log(`${logPrefix} No commits found for user_id=${user_id}`);
            return res.status(200).json([]);
        }

        const commitList = commits.map((commit) => ({
            id: commit._id.toString(),
            workflow_run_id: commit.workflow_run_id?._id.toString(),
            sha: commit.sha,
            commit: {
                author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email,
                    date: commit.commit.author.date
                },
                message: commit.commit.message
            },
            author: {
                login: commit.author.login,
                avatar_url: commit.author.avatar_url,
                html_url: commit.author.html_url
            },
            html_url: commit.html_url,
            stats: {
                total: commit.stats.total,
                additions: commit.stats.additions,
                deletions: commit.stats.deletions
            }
        }));

        console.log(`${logPrefix} Found ${commitList.length} recent commits for user_id=${user_id}`);
        res.status(200).json(commitList);
    } catch (error) {
        console.error(`${logPrefix} Error fetching recent commits: ${error.message}`);
        next(error);
    }
};