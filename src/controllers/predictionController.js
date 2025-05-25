const Prediction = require('../models/Prediction');
const MLModel = require('../models/MLModel');

exports.savePrediction = async (req, res, next) => {
    const logPrefix = "[savePrediction]";
    try {
        const {
            model_name,
            model_version,
            predicted_result,
            probability,
            threshold,
            timestamp,
            execution_time,
            github_run_id,
        } = req.body;

        // Kiểm tra các trường bắt buộc
        if (
            !model_name ||
            !model_version ||
            predicted_result === undefined ||
            probability === undefined ||
            threshold === undefined ||
            !timestamp ||
            execution_time === undefined ||
            !github_run_id
        ) {
            console.log(`${logPrefix} Missing required fields`);
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'model_name, model_version, predicted_result, probability, threshold, timestamp, execution_time, github_run_id are required',
            });
        }

        // Kiểm tra timestamp hợp lệ
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
            console.log(`${logPrefix} Invalid timestamp`);
            return res.status(400).json({
                error: 'Invalid timestamp',
                details: 'Timestamp must be a valid date string',
            });
        }

        // Kiểm tra model tồn tại và là current
        const model = await MLModel.findOne({ name: model_name, is_current: true });
        if (!model) {
            console.log(`${logPrefix} Model ${model_name} not found or not current`);
            return res.status(404).json({
                error: 'Model not found or not current',
                details: `Model ${model_name} is not the current model or does not exist`,
            });
        }

        // Kiểm tra probability và threshold hợp lệ
        if (probability < 0 || probability > 1 || threshold < 0 || threshold > 1) {
            console.log(`${logPrefix} Invalid probability or threshold`);
            return res.status(400).json({
                error: 'Invalid probability or threshold',
                details: 'Probability and threshold must be between 0 and 1',
            });
        }

        // Kiểm tra execution_time hợp lệ
        if (execution_time < 0) {
            console.log(`${logPrefix} Invalid execution_time`);
            return res.status(400).json({
                error: 'Invalid execution_time',
                details: 'Execution time must be non-negative',
            });
        }

        const prediction = await Prediction.findOneAndUpdate(
            { github_run_id },
            {
                $set: {
                    model_name,
                    model_version,
                    predicted_result,
                    probability,
                    threshold,
                    timestamp: parsedTimestamp,
                    execution_time,
                    github_run_id,
                    actual_result: null,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`${logPrefix} Prediction saved/updated for github_run_id=${github_run_id}`);

        res.status(201).json({
            message: 'Prediction saved successfully',
            prediction: {
                id: prediction._id,
                model_name: prediction.model_name,
                model_version: prediction.model_version,
                predicted_result: prediction.predicted_result,
                probability: prediction.probability,
                threshold: prediction.threshold,
                timestamp: prediction.timestamp,
                execution_time: prediction.execution_time,
                github_run_id: prediction.github_run_id,
                actual_result: prediction.actual_result,
            },
        });
    } catch (error) {
        console.error(`${logPrefix} Error: ${error.message}`);
        next(error);
    }
};

exports.updateActualResult = async (req, res, next) => {
    const logPrefix = "[updateActualResult]";
    try {
        const { github_run_id, actual_result, timestamp } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!github_run_id || actual_result === undefined || !timestamp) {
            console.log(`${logPrefix} Missing github_run_id, actual_result, or timestamp`);
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'github_run_id, actual_result, and timestamp are required',
            });
        }

        // Kiểm tra actual_result là boolean
        if (typeof actual_result !== 'boolean') {
            console.log(`${logPrefix} Invalid actual_result`);
            return res.status(400).json({
                error: 'Invalid actual_result',
                details: 'actual_result must be a boolean',
            });
        }

        // Kiểm tra timestamp hợp lệ
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
            console.log(`${logPrefix} Invalid timestamp`);
            return res.status(400).json({
                error: 'Invalid timestamp',
                details: 'Timestamp must be a valid date string',
            });
        }

        // Tìm và cập nhật prediction
        const prediction = await Prediction.findOneAndUpdate(
            { github_run_id },
            {
                $set: {
                    actual_result,
                    timestamp: parsedTimestamp,
                },
            },
            { new: true }
        );

        if (!prediction) {
            console.log(`${logPrefix} Prediction not found for github_run_id=${github_run_id}`);
            return res.status(404).json({
                error: 'Prediction not found',
                details: `No prediction found for github_run_id=${github_run_id}`,
            });
        }

        console.log(`${logPrefix} Actual result updated for github_run_id=${github_run_id}`);
        res.status(200).json({
            message: 'Actual result updated successfully',
            prediction: {
                id: prediction._id,
                model_name: prediction.model_name,
                model_version: prediction.model_version,
                predicted_result: prediction.predicted_result,
                probability: prediction.probability,
                threshold: prediction.threshold,
                timestamp: prediction.timestamp,
                execution_time: prediction.execution_time,
                github_run_id: prediction.github_run_id,
                actual_result: prediction.actual_result,
            },
        });
    } catch (error) {
        console.error(`${logPrefix} Error: ${error.message}`);
        next(error);
    }
};

exports.getPredictions = async (req, res, next) => {
    const logPrefix = "[getPredictions]";
    try {
        const { github_run_id, model_name } = req.query;
        const query = {};
        if (github_run_id) query.github_run_id = github_run_id;
        if (model_name) query.model_name = model_name;

        const predictions = await Prediction.find(query).sort({ timestamp: -1 }).lean();

        if (!predictions || predictions.length === 0) {
            console.log(`${logPrefix} No predictions found`);
            return res.status(200).json([]);
        }

        console.log(`${logPrefix} Found ${predictions.length} predictions`);
        const responsePredictions = predictions.map((prediction) => ({
            id: prediction._id,
            model_name: prediction.model_name,
            model_version: prediction.model_version,
            predicted_result: prediction.predicted_result,
            probability: prediction.probability,
            threshold: prediction.threshold,
            timestamp: prediction.timestamp,
            execution_time: prediction.execution_time,
            github_run_id: prediction.github_run_id,
            actual_result: prediction.actual_result,
        }));

        res.status(200).json(responsePredictions);
    } catch (error) {
        console.error(`${logPrefix} Error fetching predictions: ${error.message}`);
        next(error);
    }
};