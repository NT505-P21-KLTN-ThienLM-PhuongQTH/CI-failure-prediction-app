const Repo = require('../models/Repo');
const RepoData = require('../models/RepoData');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const { retrieveQueue } = require('../utils/queue');
const { extractOwnerRepo, checkRepoExists } = require('../utils/utils');

exports.addRepo = async (req, res, next) => {
  const logPrefix = '[addRepo]';
  try {
    const { user_id, url, token } = req.body;

    if (!user_id || !url || !token) {
      console.warn(`${logPrefix} Missing required fields: user_id=${!!user_id}, url=${!!url}, token=${!!token}`);
      return res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS' });
    }

    const { owner, repo } = extractOwnerRepo(url);
    const full_name = `${owner}/${repo}`;

    const checkGitHubRepo = await checkRepoExists(owner, repo, token);
    if (!checkGitHubRepo) {
      console.warn(`${logPrefix} Repository ${full_name} does not exist on GitHub`);
      return res.status(404).json({ error: `Repository ${full_name} does not exist on GitHub` });
    }

    const existingRepo = await Repo.findOne({ user_id, full_name, status: { $in: ['Pending', 'Success', 'Failed'] } });
    if (existingRepo) {
      console.log(`${logPrefix} Repository ${full_name} already exists with status ${existingRepo.status}`);
      return res.status(409).json({
        error: `Repository ${full_name} already exists with status ${existingRepo.status}.`,
        status: existingRepo.status,
      });
    }

    const pendingRepo = new Repo({
      user_id,
      full_name,
      name: repo,
      html_url: url,
      status: 'Pending',
      token, // Lưu token vào Repo
    });

    await pendingRepo.save();

    res.status(201).json({
      id: pendingRepo._id.toString(),
      full_name: pendingRepo.full_name,
      name: pendingRepo.name,
      html_url: pendingRepo.html_url,
      status: pendingRepo.status,
    });

    await retrieveQueue.add({
      repoId: pendingRepo._id,
      url,
      token,
      owner,
      repo,
      logPrefix,
    });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.getUserRepos = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const repos = await Repo.find({ user_id }).lean();
    res.status(200).json(repos.map(repo => ({
      id: repo._id.toString(),
      full_name: repo.full_name,
      name: repo.name,
      html_url: repo.html_url,
      status: repo.status,
    })));
  } catch (error) {
    next(error);
  }
};

exports.updateRepo = async (req, res, next) => {
  const logPrefix = '[updateRepo]';
  try {
    const repoId = req.params.id;
    const { url, token } = req.body;

    if (!url || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { owner, repo } = extractOwnerRepo(url);

    const checkGitHubRepo = await checkRepoExists(owner, repo, token);
    if (!checkGitHubRepo) {
      console.warn(`${logPrefix} Repository ${full_name} does not exist on GitHub`);
      return res.status(404).json({ error: `Repository ${full_name} does not exist on GitHub` });
    }

    const pendingRepo = await Repo.findOneAndUpdate(
      { _id: repoId, },
      { status: 'Pending', token },
      { new: true }
    );

    if (!pendingRepo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    res.status(200).json({
      id: pendingRepo._id.toString(),
      full_name: pendingRepo.full_name,
      name: pendingRepo.name,
      html_url: pendingRepo.html_url,
      status: pendingRepo.status,
    });

    await retrieveQueue.add({
      repoId: pendingRepo._id,
      url,
      token,
      owner,
      repo,
      logPrefix,
    });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.deleteRepo = async (req, res, next) => {
  const logPrefix = '[deleteRepo]';
  try {
    const repoId = req.params.id;
    const deletedRepo = await Repo.findOneAndDelete({ _id: repoId });

    if (!deletedRepo) {
      console.log(`${logPrefix} Repository not found: ${repoId}`);
      return res.status(404).json({ error: 'Repository not found' });
    }

    console.log(`${logPrefix} Repository deleted successfully: ${deletedRepo.full_name}`);

    await RepoData.deleteOne({ repo_id: repoId });
    console.log(`${logPrefix} Deleted repo data for repository ${repoId}`);

    const deletedWorkflows = await Workflow.deleteMany({ repo_id: repoId });
    console.log(`${logPrefix} Deleted ${deletedWorkflows.deletedCount} workflows for repository ${repoId}`);

    const deletedWorkflowsRuns = await WorkflowRun.deleteMany({ repo_id: repoId });
    console.log(`${logPrefix} Deleted ${deletedWorkflowsRuns.deletedCount} workflow runs for repository ${repoId}`);

    res.status(200).json({ 
      message: 'Repository deleted successfully',
      deletedRepo: deletedRepo.full_name,
      deletedWorkflows: deletedWorkflows.deletedCount,
      deletedWorkflowsRuns: deletedWorkflowsRuns.deletedCount
    });
  } catch (error) {
    next(error);
  }
};
