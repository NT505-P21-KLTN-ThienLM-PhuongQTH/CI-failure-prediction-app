const Repo = require('../models/Repo');
const RepoData = require('../models/RepoData');

exports.getRepoDetails = async (req, res, next) => {
    const logPrefix = '[getRepoDetails]';
    try {
        const repoId = req.params.id;

        const repo = await Repo.findById(repoId);
        if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
        }

        if (repo.status !== 'Success') {
        return res.status(400).json({ error: 'Repository data not available (status is not Success)' });
        }

        const repoData = await RepoData.findOne({ repo_id: repoId }).lean();
        if (!repoData) {
        return res.status(404).json({ error: 'Repository details not found' });
        }

        console.log(`${logPrefix} Repository details retrieved for repo ${repoId}`);
        res.status(200).json(repoData);
    } catch (error) {
        console.error(`${logPrefix} Error: ${error.message}`);
        next(error);
    }
};
