const axios = require('axios');
const MLModel = require('../models/MLModel');

exports.getModelInfo = async (req, res, next) => {
    const logPrefix = "[getModelInfo]";
    try {
        // Lấy model_name từ query hoặc body
        const { model_name } = req.query;

        // Kiểm tra model_name hợp lệ
        const validModels = ['Stacked-LSTM', 'Bi-LSTM', 'Conv-LSTM'];
        if (!model_name || !validModels.includes(model_name)) {
            console.log(`${logPrefix} Invalid or missing model_name: ${model_name}`);
            return res.status(400).json({
                error: 'Invalid or missing model_name',
                details: `model_name must be one of: ${validModels.join(', ')}`,
            });
        }

        // Gọi API MLflow
        const mlflowUrl = `${process.env.MLFLOW_API_URL}/registered-models/get?name=${model_name}`;
        let response;
        try {
            response = await axios.get(mlflowUrl);
        } catch (apiError) {
            console.error(`${logPrefix} Error calling MLflow API: ${apiError.message}`);
            return res.status(500).json({
                error: 'Failed to fetch model info from MLflow',
                details: apiError.message,
            });
        }

        const modelData = response.data?.registered_model;
        if (!modelData) {
            console.log(`${logPrefix} No model data found for model_name=${model_name}`);
            return res.status(404).json({ error: `Model ${model_name} not found in MLflow` });
        }

        // Chuyển đổi timestamp từ milliseconds sang Date
        const creationTimestamp = new Date(modelData.creation_timestamp);
        const lastUpdatedTimestamp = new Date(modelData.last_updated_timestamp);
        const latestVersions = modelData.latest_versions.map((version) => ({
            name: version.name,
            version: version.version,
            creation_timestamp: new Date(version.creation_timestamp),
            last_updated_timestamp: new Date(version.last_updated_timestamp),
            current_stage: version.current_stage,
            description: version.description,
            source: version.source,
            run_id: version.run_id,
            status: version.status,
            run_link: version.run_link,
        }));

        // Đặt is_current = false cho tất cả model khác
        await MLModel.updateMany(
            { name: { $ne: model_name } },
            { $set: { is_current: false } }
        );

        // Lưu hoặc cập nhật model hiện tại với is_current = true
        const updatedModel = await MLModel.findOneAndUpdate(
            { name: model_name },
            {
                name: model_name,
                creation_timestamp: creationTimestamp,
                last_updated_timestamp: lastUpdatedTimestamp,
                latest_versions: latestVersions,
                is_current: true, // Đặt model này là hiện tại
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`${logPrefix} Model ${model_name} saved/updated in DB with is_current=true`);

        // Trả về dữ liệu cho UI
        const responseData = {
            id: updatedModel._id,
            name: updatedModel.name,
            creation_timestamp: updatedModel.creation_timestamp,
            last_updated_timestamp: updatedModel.last_updated_timestamp,
            latest_versions: updatedModel.latest_versions,
            is_current: updatedModel.is_current,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(`${logPrefix} Error: ${error.message}`);
        next(error);
    }
};

exports.getAllModels = async (req, res, next) => {
    const logPrefix = "[getAllModels]";
    try {
        // Lấy toàn bộ models từ DB
        const models = await MLModel.find().sort({ last_updated_timestamp: -1 }).lean();

        if (!models || models.length === 0) {
            console.log(`${logPrefix} No models found in DB`);
            return res.status(200).json([]);
        }

        console.log(`${logPrefix} Found ${models.length} models in DB`);
        const responseModels = models.map((model) => ({
            id: model._id,
            name: model.name,
            creation_timestamp: model.creation_timestamp,
            last_updated_timestamp: model.last_updated_timestamp,
            latest_versions: model.latest_versions,
            is_current: model.is_current,
        }));
        res.status(200).json(responseModels);
    } catch (error) {
        console.error(`${logPrefix} Error fetching all models: ${error.message}`);
        next(error);
    }
};

exports.getCurrentModel = async (req, res, next) => {
    const logPrefix = "[getCurrentModel]";
    try {
        // Tìm model có is_current = true
        const currentModel = await MLModel.findOne({ is_current: true }).lean();

        if (!currentModel) {
            console.log(`${logPrefix} No current model found`);
            return res.status(404).json({ error: 'No current model found' });
        }

        console.log(`${logPrefix} Found current model: ${currentModel.name}`);
        const responseData = {
            id: currentModel._id,
            name: currentModel.name,
            creation_timestamp: currentModel.creation_timestamp,
            last_updated_timestamp: currentModel.last_updated_timestamp,
            latest_versions: currentModel.latest_versions,
            is_current: currentModel.is_current,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(`${logPrefix} Error fetching current model: ${error.message}`);
        next(error);
    }
};