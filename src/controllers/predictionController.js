const Prediction = require('../models/Prediction');
const MLModel = require('../models/MLModel');
const WorkflowRun = require('../models/WorkflowRun');
const Report = require("../models/Report")

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
            project_name,
            branch,
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
            !github_run_id ||
            !project_name ||
            !branch
        ) {
            console.log(`${logPrefix} Missing required fields`);
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'model_name, model_version, predicted_result, probability, threshold, timestamp, execution_time, github_run_id, project_name, branch are required',
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
                    project_name,
                    branch,
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
                project_name: prediction.project_name,
                branch: prediction.branch,
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
                project_name: prediction.project_name,
                branch: prediction.branch,
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
        const { github_run_id, model_name, project_name, branch } = req.query;
        const query = {};

        // Thêm các điều kiện vào query nếu tham số tồn tại
        if (github_run_id) query.github_run_id = github_run_id;
        if (model_name) query.model_name = model_name;
        if (project_name) query.project_name = project_name;
        if (branch) query.branch = branch;

        const predictions = await Prediction.find(query).sort({ timestamp: -1 }).lean();

        if (!predictions || predictions.length === 0) {
            console.log(`${logPrefix} No predictions found for query: ${JSON.stringify(query)}`);
            return res.status(200).json([]);
        }

        console.log(`${logPrefix} Found ${predictions.length} predictions for query: ${JSON.stringify(query)}`);
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
            project_name: prediction.project_name,
            branch: prediction.branch,
        }));

        res.status(200).json(responsePredictions);
    } catch (error) {
        console.error(`${logPrefix} Error fetching predictions: ${error.message}`);
        next(error);
    }
};

exports.getBatchPredictions = async (req, res, next) => {
    const logPrefix = "[getBatchPredictions]";
    try {
        const { github_run_ids, project_name, branch } = req.query;

        // Kiểm tra các trường bắt buộc
        if (!github_run_ids || !project_name || !branch) {
            console.log(`${logPrefix} Missing github_run_ids, project_name, or branch`);
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'github_run_ids, project_name, and branch are required',
            });
        }

        // Chuyển chuỗi thành mảng số
        const runIds = github_run_ids.split(',').map(id => id.trim());

        const predictions = await Prediction.find({
            "github_run_id": { $in: runIds },
            project_name,
            branch,
        }).lean();

        if (!predictions || predictions.length === 0) {
            console.log(`${logPrefix} No predictions found for batch query`);
            return res.status(200).json({});
        }

        // Trả về đầy đủ thông tin prediction thay vì chỉ predicted_result
        const predictionsMap = predictions.reduce((acc, pred) => {
            acc[pred.github_run_id] = {
                predicted_result: pred.predicted_result,
                timestamp: pred.timestamp,
                model_name: pred.model_name,
                model_version: pred.model_version,
                execution_time: pred.execution_time,
                probability: pred.probability,
                threshold: pred.threshold,
                project_name: pred.project_name,
                branch: pred.branch,
            };
            return acc;
        }, {});

        console.log(`${logPrefix} Found ${predictions.length} predictions for batch query`);
        res.status(200).json(predictionsMap);
    } catch (error) {
        console.error(`${logPrefix} Error fetching batch predictions: ${error.message}`);
        next(error);
    }
};

exports.getPredictionResultById = async (req, res, next) => {
    const logPrefix = "[getPredictionResultById]";
    try {
        const { id } = req.params;
        if (!id) {
            console.log(`${logPrefix} Missing id param`);
            return res.status(400).json({
                error: 'Missing id param',
                details: 'Prediction id is required in params',
            });
        }

        const prediction = await Prediction.findById(id).lean();
        if (!prediction) {
            console.log(`${logPrefix} Prediction not found for id=${id}`);
            return res.status(404).json({
                error: 'Prediction not found',
                details: `No prediction found for id=${id}`,
            });
        }

        res.status(200).json({
            predicted_result: prediction.predicted_result,
            actual_result: prediction.actual_result,
        });
    } catch (error) {
        console.error(`${logPrefix} Error: ${error.message}`);
        next(error);
    }
};
