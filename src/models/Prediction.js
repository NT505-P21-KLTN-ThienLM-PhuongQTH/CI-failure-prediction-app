const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema({
  workflow_run_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkflowRun',
    required: false, // null nếu là dự đoán cho run tiếp theo chưa tạo
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  repo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repo',
    required: true,
  },
  github_workflow_id: {
    type: Number,
    required: true,
  },
  head_branch: {
    type: String,
    required: true,
  },
  predicted_outcome: {
    type: String,
    enum: ['success', 'failure'],
    required: true,
  },
  prediction_confidence: {
    type: Number,
    min: 0,
    max: 100,
    required: true,
  },
  prediction_timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

const Prediction = mongoose.model('Prediction', PredictionSchema);

module.exports = Prediction;