const mongoose = require('mongoose');
const Repo = require('../models/Repo');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');

exports.getWorkflows = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;

    if (!user_id || !repo_id || !branch) {
      return res.status(400).json({ error: 'Missing user_id, repo_id, or branch' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
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
    }).distinct('workflow_id');

    // Chỉ giữ lại các workflows có workflow_runs trên nhánh được chọn
    const filteredWorkflows = workflows.filter(workflow =>
      workflowRuns.some(workflowId => workflowId.toString() === workflow._id.toString())
    );

    res.status(200).json(filteredWorkflows.map(workflow => ({
      id: workflow._id.toString(),
      github_workflow_id: workflow.github_workflow_id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      html_url: workflow.html_url,
    })));
  } catch (error) {
    console.error('Error in getWorkflows:', error);
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