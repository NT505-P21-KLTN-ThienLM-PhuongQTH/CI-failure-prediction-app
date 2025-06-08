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

exports.getAllUserRepos = async (req, res, next) => {
  const logPrefix = '[getAllUserRepos]';
  try {
    const repos = await Repo.find({}).lean();
    if (!repos || repos.length === 0) {
      console.log(`${logPrefix} No repositories found`);
      return res.status(404).json({ error: 'No repositories found' });
    }

    console.log(`${logPrefix} All repositories retrieved by admin: ${req.user.id}`);
    res.status(200).json(repos.map(repo => ({
      id: repo._id.toString(),
      user_id: repo.user_id,
      full_name: repo.full_name,
      name: repo.name,
      html_url: repo.html_url,
      status: repo.status,
    })));
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
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

    const deletedRepoData = await RepoData.deleteOne({ repo_id: repoId });
    if (deletedRepoData.deletedCount === 0) {
      console.log(`${logPrefix} RepoData not found for repository ${repoId}`);
      return res.status(404).json({ error: 'RepoData not found for this repository' });
    }
    console.log(`${logPrefix} Deleted repo data for repository ${repoId}`);

    let deletedWorkflowsCount = 0;
    let deletedWorkflowsRunsCount = 0;
    let deletedCommitsCount = 0;

    try {
      const deletedWorkflows = await Workflow.deleteMany({ repo_id: repoId });
      deletedWorkflowsCount = deletedWorkflows.deletedCount || 0;
      console.log(`${logPrefix} Deleted ${deletedWorkflowsCount} workflows for repository ${repoId}`);
    } catch (e) {
      console.log(`${logPrefix} No workflows found or error deleting workflows for repository ${repoId}`);
    }

    let workflowRunIds = [];
    try {
      const workflowRuns = await WorkflowRun.find({ repo_id: repoId }, '_id');
      workflowRunIds = workflowRuns.map(run => run._id);
      const deletedWorkflowsRuns = await WorkflowRun.deleteMany({ repo_id: repoId });
      deletedWorkflowsRunsCount = deletedWorkflowsRuns.deletedCount || 0;
      console.log(`${logPrefix} Deleted ${deletedWorkflowsRunsCount} workflow runs for repository ${repoId}`);
    } catch (e) {
      console.log(`${logPrefix} No workflow runs found or error deleting workflow runs for repository ${repoId}`);
    }

    try {
      if (workflowRunIds.length > 0) {
        const deletedCommits = await Commit.deleteMany({ workflow_run_id: { $in: workflowRunIds } });
        deletedCommitsCount = deletedCommits.deletedCount || 0;
        console.log(`${logPrefix} Deleted ${deletedCommitsCount} commits for repository ${repoId}`);
      }
    } catch (e) {
      console.log(`${logPrefix} No commits found or error deleting commits for repository ${repoId}`);
    }

    res.status(200).json({
      message: 'Repository deleted successfully',
      deletedRepo: deletedRepo.full_name,
      deletedRepoData: deletedRepoData.deletedCount,
      deletedWorkflows: deletedWorkflowsCount,
      deletedWorkflowsRuns: deletedWorkflowsRunsCount,
      deletedCommits: deletedCommitsCount
    });
  } catch (error) {
    console.error(`${logPrefix} Error deleting repository: ${error.message}`);
    next(error);
  }
};
