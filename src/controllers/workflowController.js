const mongoose = require('mongoose');
const Repo = require('../models/Repo');
const RepoData = require('../models/RepoData');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const axios = require('axios');
const { extractBranchFromHtmlUrl } = require("../utils/utils");

exports.getWorkflowsWithRuns = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;

    if (!user_id || !repo_id || !branch) {
      return res.status(400).json({ error: "Missing user_id, repo_id, or branch" });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Lấy tất cả workflows của repository
    const workflows = await Workflow.find({
      user_id: userIdObject,
      repo_id: repoIdObject,
    }).lean();

    // Lấy danh sách workflow_ids có workflow_runs trên nhánh được chọn
    const workflowRuns = await WorkflowRun.find({
      user_id: userIdObject,
      repo_id: repoIdObject,
      head_branch: branch,
    }).distinct("workflow_id");

    // Chỉ giữ lại các workflows có workflow_runs trên nhánh được chọn
    const filteredWorkflows = workflows.filter((workflow) =>
      workflowRuns.some((workflowId) => workflowId.toString() === workflow._id.toString())
    );

    res.status(200).json(
      filteredWorkflows.map((workflow) => ({
        id: workflow._id.toString(),
        github_workflow_id: workflow.github_workflow_id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
        html_url: workflow.html_url,
      }))
    );
  } catch (error) {
    console.error("Error in getWorkflowsWithRuns:", error);
    next(error);
  }
};

exports.getRepoWorkflows = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;

    if (!user_id || !repo_id) {
      return res.status(400).json({ error: "Missing user_id or repo_id" });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Lấy tất cả workflows của repository
    const workflows = await Workflow.find({
      user_id: userIdObject,
      repo_id: repoIdObject,
    }).lean();

    res.status(200).json(
      workflows.map((workflow) => ({
        id: workflow._id.toString(),
        github_workflow_id: workflow.github_workflow_id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
        html_url: workflow.html_url,
      }))
    );
  } catch (error) {
    console.error("Error in getRepoWorkflows:", error);
    next(error);
  }
};

exports.getWorkflowDetails = async (req, res, next) => {
  try {
    const workflow_id = req.params.id;

    if (!workflow_id) {
      return res.status(400).json({ error: 'Missing workflow_id' });
    }

    const workflowIdObject = new mongoose.Types.ObjectId(workflow_id);
    const workflow = await Workflow.findOne({ _id: workflowIdObject }).lean();
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.status(200).json({
      id: workflow._id.toString(),
      github_workflow_id: workflow.github_workflow_id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      html_url: workflow.html_url,
    });
  } catch (error) {
    console.error('Error in getWorkflowDetails:', error);
    next(error);
  }
}

exports.getWorkflowContent = async (req, res, next) => {
  const logPrefix = "[getWorkflowContent]";
  try {
    const { workflow_id, repo_id } = req.query;

    if (!workflow_id || !repo_id) {
      return res.status(400).json({ error: "Missing workflow_id or repo_id" });
    }

    // Tìm repository
    const repo = await Repo.findById(repo_id);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Tìm owner trong repo data
    const repoData = await RepoData.findOne({ repo_id: repo_id }).populate("owner").lean();
    if (!repoData) {
      return res.status(404).json({ error: "RepoData not found" });
    }

    // Tìm workflow trực tiếp từ MongoDB
    const workflow = await Workflow.findById(workflow_id).lean();
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    // Kiểm tra xem workflow có thuộc repo_id không
    if (workflow.repo_id.toString() !== repo_id.toString()) {
      return res.status(400).json({ error: "Workflow does not belong to the specified repository" });
    }

    // Kiểm tra path
    if (!workflow.path) {
      return res.status(400).json({ error: "Workflow path not found" });
    }
    const filePath = workflow.path;

    const owner = repoData.owner.login;
    const repoName = repo.name;

    // Trích xuất nhánh từ html_url
    const branch = extractBranchFromHtmlUrl(workflow.html_url);
    if (!branch) {
      return res.status(400).json({ error: "Failed to extract branch from html_url" });
    }

    // Chuẩn bị header cho API GitHub, luôn sử dụng token
    const token = repo.decryptToken();
    const headers = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `token ${token}`,
    };

    // Lấy nội dung file từ GitHub
    const fileResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}?ref=${branch}`,
      { headers }
    );

    const content = Buffer.from(fileResponse.data.content, "base64").toString("utf8");
    const sha = fileResponse.data.sha;

    res.status(200).json({ content, sha, branch });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      if (error.response.status === 403 && error.response.data.message.includes("API rate limit exceeded")) {
        return res.status(429).json({ error: "GitHub API rate limit exceeded. Please try again later." });
      }
      if (error.response.status === 401) {
        return res.status(401).json({ error: "Invalid or expired GitHub token. Please re-authenticate." });
      }
    }
    res.status(500).json({ error: "Failed to fetch workflow content", details: error.message });
  }
};

exports.commitWorkflowContent = async (req, res, next) => {
  const logPrefix = "[commitWorkflowContent]";
  try {
    const { repo_id, workflow_id, content, message } = req.body;

    if (!repo_id || !workflow_id || !content || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const repo = await Repo.findById(repo_id);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const repoData = await RepoData.findOne({ repo_id: repo_id }).populate("owner").lean();
    if (!repoData) {
      return res.status(404).json({ error: "RepoData not found" });
    }

    const workflow = await Workflow.findById(workflow_id).lean();
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (!workflow.path) {
      return res.status(400).json({ error: "Workflow path not found" });
    }
    const filePath = workflow.path;

    const token = repo.decryptToken();
    const owner = repoData.owner.login;
    const repoName = repo.name;

    // Trích xuất nhánh từ html_url
    const branch = extractBranchFromHtmlUrl(workflow.html_url);
    if (!branch) {
      return res.status(400).json({ error: "Failed to extract branch from html_url" });
    }

    // Lấy SHA hiện tại của file
    const fileResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    const sha = fileResponse.data.sha;

    // Commit nội dung mới
    const commitResponse = await axios.put(
      `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`,
      {
        message,
        content: Buffer.from(content).toString("base64"),
        sha,
        branch,
      },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    res.status(200).json({ message: "Workflow updated successfully", commit: commitResponse.data });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    res.status(500).json({ error: "Failed to commit workflow content", details: error.message });
  }
};