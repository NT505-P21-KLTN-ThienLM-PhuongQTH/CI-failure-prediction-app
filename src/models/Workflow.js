const mongoose = require('mongoose');

const WorkflowSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Tham chiếu đến User
  github_workflow_id: { type: Number, required: true }, // Lưu github_id từ GitHub
  repo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Repo', required: true }, // Tham chiếu đến Repo
  name: { type: String, required: true },
  path: { type: String, required: true },
  state: { type: String, required: true },
  created_at: { type: Date, required: true },
  updated_at: { type: Date, required: true },
  html_url: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Workflow', WorkflowSchema);