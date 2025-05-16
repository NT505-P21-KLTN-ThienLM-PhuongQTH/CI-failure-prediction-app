const mongoose = require('mongoose');

const commitSchema = new mongoose.Schema({
    workflow_run_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowRun', required: true }, // Tham chiếu đến WorkflowRun
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Tham chiếu đến User
    sha: { type: String, required: true },
    commit: { 
        type: {
            author: {
                name: { type: String, required: true },
                email: { type: String, required: true },
                date: { type: Date, required: true },
                _id: false,
            },
            message: { type: String, required: true },
            _id: false,
        }
    },
    author: {
        login: { type: String, required: true },
        avatar_url: { type: String, required: true },
        html_url: { type: String, required: true },
    },
    html_url: { type: String, required: true },
    stats: {
        type: {
            total: { type: Number, required: true },
            additions: { type: Number, required: true },
            deletions: { type: Number, required: true },
        },
        _id: false,
    },
}, { timestamps: true });

module.exports = mongoose.model('Commit', commitSchema);