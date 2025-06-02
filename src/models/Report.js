const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    github_run_id: { type: Number, required: true },
    prediction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction', required: true },
    project_name: { type: String, required: true },
    branch: { type: String, required: true },
    reported_by: { type: String, required: true }, // Email
    reported_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema, 'reports');