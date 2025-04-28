const mongoose = require('mongoose');

const WorkflowRunSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Tham chiếu đến User
  github_run_id: { type: Number, required: true }, // Lưu github_id của run từ GitHub
  github_workflow_id: { type: Number, required: true }, // Lưu github_id của workflow từ GitHub
  workflow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true }, // Tham chiếu đến Workflow
  repo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Repo', required: true }, // Tham chiếu đến Repo
  name: { type: String, required: true },
  head_branch: { type: String, required: true },
  head_sha: { type: String, required: true },
  run_number: { type: Number, required: true },
  status: { type: String, required: true },
  conclusion: { type: String },
  created_at: { type: Date, required: true },
  run_started_at: { type: Date, required: true },
  updated_at: { type: Date, required: true },
  event: { type: String, required: true },
  path: { type: String, required: true },
  run_attempt: { type: Number, required: true },
  display_title: { type: String, required: true },
  html_url: { type: String, required: true },
  actor: {
    type: {
      login: { type: String, required: true },
      avatar_url: { type: String, required: false },
      html_url: { type: String, required: false },
      _id: false,
    },
  },
  triggering_actor: {
    type: {
      login: { type: String, required: true },
      avatar_url: { type: String, required: false },
      html_url: { type: String, required: false },
      _id: false,
    },
  },
});

// Tạo index cho user_id, workflow_id, github_workflow_id và github_run_id để truy vấn nhanh hơn
// WorkflowRunSchema.index({ user_id: 1, workflow_id: 1, github_workflow_id: 1, github_run_id: 1 });

module.exports = mongoose.model('WorkflowRun', WorkflowRunSchema, 'workflow_runs');