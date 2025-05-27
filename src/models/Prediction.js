const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema({
    model_name: {
        type: String,
        required: true,
    },
    model_version: {
        type: String,
        required: true,
    },
    predicted_result: {
        type: Boolean,
        required: true,
    },
    probability: {
        type: Number,
        required: true,
        min: 0,
        max: 1,
    },
    threshold: {
        type: Number,
        required: true,
        min: 0,
        max: 1,
    },
    timestamp: {
        type: Date,
        required: true, // Không có default, yêu cầu từ request
    },
    execution_time: {
        type: Number,
        required: true,
        min: 0,
    },
    actual_result: {
        type: Boolean,
        default: null,
    },
    github_run_id: {
        type: Number,
        required: true,
        unique: true,
    },
    project_name: {
        type: String,
        required: true,
    },
    branch: {
        type: String,
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Prediction', PredictionSchema);