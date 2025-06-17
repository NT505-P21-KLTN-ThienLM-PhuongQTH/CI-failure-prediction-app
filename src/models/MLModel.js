const mongoose = require('mongoose');

const MLModelSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Tên model: Stacked-LSTM, Bi-LSTM, ConvLSTM
    creation_timestamp: { type: Date, required: true }, // Chuyển timestamp thành Date
    last_updated_timestamp: { type: Date, required: true }, // Chuyển timestamp thành Date
    latest_versions: [
        {
            name: { type: String, required: true },
            version: { type: String, required: true },
            creation_timestamp: { type: Date, required: true },
            last_updated_timestamp: { type: Date, required: true },
            current_stage: { type: String, default: 'None' },
            description: { type: String, default: '' },
            source: { type: String, required: true },
            run_id: { type: String, required: true },
            status: { type: String, default: 'READY' },
            run_link: { type: String, default: '' },
            _id: false,
        },
    ],
    is_current: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model('MLModel', MLModelSchema, 'ml_models');