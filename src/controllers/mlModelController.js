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

    // Lưu hoặc cập nhật vào MongoDB (upsert)
    const updatedModel = await MLModel.findOneAndUpdate(
        { name: model_name },
        {
            name: model_name,
            creation_timestamp: creationTimestamp,
            last_updated_timestamp: lastUpdatedTimestamp,
            latest_versions: latestVersions,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`${logPrefix} Model ${model_name} saved/updated in DB`);

    // Trả về dữ liệu cho UI
    const responseData = {
        id: updatedModel._id,
        name: updatedModel.name,
        creation_timestamp: updatedModel.creation_timestamp,
        last_updated_timestamp: updatedModel.last_updated_timestamp,
        latest_versions: updatedModel.latest_versions,
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
        }));
        res.status(200).json(responseModels);
    } catch (error) {
        console.error(`${logPrefix} Error fetching all models: ${error.message}`);
        next(error);
    }
};