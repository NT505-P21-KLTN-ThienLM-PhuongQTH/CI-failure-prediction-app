const mongoose = require('mongoose');

const modelSchema = new mongoose.Schema({
    model_name: { type: String, required: true },
    version: { type: Number, required: true },
    run_id: { type: String },
    stage: { type: String },
    description: { type: String },
    tags: { type: Object },
    created_at: { type: Date, default: Date.now },
    artifact_uri: { type: String },
    signature: { type: Object },
    created_at_app: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('UserData', modelSchema);