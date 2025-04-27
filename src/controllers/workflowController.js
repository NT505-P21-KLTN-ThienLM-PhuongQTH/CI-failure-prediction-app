const axios = require('axios');
const mongoose = require('mongoose');
const Repo = require('../models/Repo');
const WebhookUser = require('../models/WebhookUser');
const WorkflowRun = require('../models/WorkflowRun');
const syncWorkflowsAndRuns = require('../utils/syncWorkflowsAndRuns');

exports.handleWorkflowRun = async (req, res, next) => {
  const logPrefix = '[handleWorkflowRun]';
  console.log(`${logPrefix} Received webhook request`);

  try {
    const webhookUrl = req.originalUrl;
    console.log(`${logPrefix} Webhook URL: ${webhookUrl}`);

    const webhookUser = await WebhookUser.findOne({ webhook_url: webhookUrl }).populate('user_id');
    if (!webhookUser) {
      console.warn(`${logPrefix} No user found for webhook URL: ${webhookUrl}`);
      return res.status(404).json({ error: 'User not found for this webhook', code: 'USER_NOT_FOUND' });
    }

    const user_id = webhookUser.user_id._id.toString();
    console.log(`${logPrefix} Processing for user: ${user_id}`);

    const payload = req.body;
    console.log(`${logPrefix} Webhook payload:`, JSON.stringify(payload, null, 2));

    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      console.warn(`${logPrefix} Repository full_name not found in webhook payload`);
      return res.status(400).json({ error: 'Repository information missing in webhook payload', code: 'MISSING_REPO_INFO' });
    }

    const repo = await Repo.findOne({ user_id: new mongoose.Types.ObjectId(user_id), full_name: repoFullName });
    if (!repo) {
      console.warn(`${logPrefix} Repository ${repoFullName} not found for user ${user_id}`);
      return res.status(404).json({ error: 'Repository not found', code: 'REPO_NOT_FOUND' });
    }

    console.log(`${logPrefix} Processing webhook for repository: ${repoFullName}`);

    const url = `https://github.com/${repo.owner.login}/${repo.name}`;
    const token = repo.decryptToken();

    console.log(`${logPrefix} Calling /retrieve for repo: ${url}`);
    const retrieveResponse = await axios.post(
      'http://localhost:4567/retrieve',
      { url, token },
      {
        timeout: 600000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (retrieveResponse.status !== 200 || retrieveResponse.data.status !== 'success') {
      throw new Error(`Failed to retrieve repository ${repoFullName}: ${retrieveResponse.statusText || retrieveResponse.data.message}`);
    }

    console.log(`${logPrefix} /retrieve successful for ${repoFullName}`);

    await syncWorkflowsAndRuns(user_id, repo, logPrefix);

    console.log(`${logPrefix} Webhook processed successfully for repository ${repoFullName}`);
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`${logPrefix} Response status: ${error.response.status}`);
    }
    if (error.request) {
      console.error(`${logPrefix} No response received from server`);
    }
    console.error(`${logPrefix} Error stack: ${error.stack}`);
    next(error);
  }
};

// API để lấy danh sách nhánh có workflow runs
exports.getBranchesWithRuns = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;

    if (!user_id || !repo_id) {
      return res.status(400).json({ error: 'Missing user_id or repo_id' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const branches = await WorkflowRun.distinct('head_branch', {
      user_id: userIdObject,
      repo_id: repo._id,
    });

    res.status(200).json(branches);
  } catch (error) {
    console.error('Error in getBranchesWithRuns:', error);
    next(error);
  }
};

exports.getPipelineData = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;
    const timeUnit = req.query.timeUnit || 'day';
    const recentDays = parseInt(req.query.recentDays) || 7;

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const query = { user_id: userIdObject };
    if (repo_id) {
      const repoIdObject = new mongoose.Types.ObjectId(String(repo_id)); // repo_id là ObjectId
      const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      query.repo_id = repo._id;
    }

    if (branch) {
      query.head_branch = branch;
    }

    const runs = await WorkflowRun.find(query).lean();

    const groupedData = {};
    runs.forEach((run) => {
      const date = new Date(run.created_at);
      let timeText;

      if (timeUnit === 'day') {
        timeText = date.toISOString().split('T')[0];
      } else if (timeUnit === 'week') {
        const week = Math.ceil(date.getDate() / 7);
        timeText = `Week ${week} ${date.getFullYear()}`;
      } else {
        timeText = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      }

      if (!groupedData[timeText]) {
        groupedData[timeText] = {
          success: 0,
          failed: 0,
          date: date.toISOString(),
        };
      }

      if (run.conclusion === 'success') {
        groupedData[timeText].success += 1;
      } else if (run.conclusion === 'failure') {
        groupedData[timeText].failed += 1;
      }
    });

    let pipelineData = Object.keys(groupedData).map((timeText) => ({
      timeText,
      success: groupedData[timeText].success,
      failed: groupedData[timeText].failed,
      date: groupedData[timeText].date,
    }));

    pipelineData.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (timeUnit === 'day') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - recentDays);
      pipelineData = pipelineData.filter((item) => new Date(item.date) >= cutoffDate);
    }

    const result = pipelineData.map((item) => ({
      timeText: item.timeText,
      success: item.success,
      failed: item.failed,
      predictedFailed: Math.round(item.failed * 1.2),
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getPipelineData:', error);
    next(error);
  }
};