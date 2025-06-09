const Report = require('../models/Report');
const Prediction = require('../models/Prediction');
const WorkflowRun = require('../models/WorkflowRun');
const { sendPredictionMismatchEmail } = require('../services/emailService');
const { updateMLDataset } = require('../services/mlService');
const axios = require('axios');

exports.reportToAdmin = async (req, res, next) => {
  const logPrefix = '[reportToAdmin]';
  try {
    const { github_run_id, reported_by } = req.body;

    if (!github_run_id || !reported_by) {
      console.log(`${logPrefix} Missing github_run_id or reported_by`);
      return res.status(400).json({ error: 'Missing github_run_id or reported_by' });
    }

    const githubRunId = Number(github_run_id);
    if (isNaN(githubRunId)) {
      console.log(`${logPrefix} Invalid github_run_id: ${github_run_id}`);
      return res.status(400).json({ error: 'Invalid github_run_id' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reported_by)) {
      console.log(`${logPrefix} Invalid email format: ${reported_by}`);
      return res.status(400).json({ error: 'Invalid email format for reported_by' });
    }

    const prediction = await Prediction.findOne({ github_run_id: githubRunId }).lean();
    if (!prediction) {
      console.log(`${logPrefix} Prediction not found for github_run_id=${githubRunId}`);
      return res.status(404).json({ error: 'Prediction not found' });
    }

    const workflowRun = await WorkflowRun.findOne({ github_run_id: githubRunId }).lean();
    if (!workflowRun) {
      console.log(`${logPrefix} WorkflowRun not found for github_run_id=${githubRunId}`);
      return res.status(404).json({ error: 'WorkflowRun not found' });
    }

    if (!workflowRun.conclusion) {
      console.log(`${logPrefix} WorkflowRun has no conclusion for github_run_id=${githubRunId}`);
      return res.status(400).json({ error: 'WorkflowRun not completed' });
    }

    const actual_result = workflowRun.conclusion !== 'success';
    if (prediction.predicted_result === actual_result) {
      console.log(`${logPrefix} No mismatch to report for github_run_id=${githubRunId}`);
      return res.status(400).json({ error: 'No mismatch to report' });
    }

    const report = await Report.create({
      github_run_id: githubRunId,
      prediction_id: prediction._id,
      project_name: prediction.project_name,
      branch: prediction.branch,
      reported_by,
    });

    await sendPredictionMismatchEmail({
      logPrefix,
      github_run_id: githubRunId,
      project_name: prediction.project_name,
      branch: prediction.branch,
      predicted_result: prediction.predicted_result,
      actual_result,
      reported_by,
    });

    console.log(`${logPrefix} Report created and email sent for github_run_id=${githubRunId}`);
    res.status(200).json({ message: 'Report sent to admin', report_id: report._id });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.handleAdminAction = async (req, res, next) => {
  const logPrefix = '[handleAdminAction]';
  try {
    const { action, admin_email } = req.body;
    const reportId = req.params.reportId;

    // Kiểm tra đầu vào
    if (!reportId || !action || !admin_email) {
      console.log(`${logPrefix} Missing reportId, action, or admin_email`);
      return res.status(400).json({ error: 'Missing reportId, action, or admin_email' });
    }

    if (!['approve', 'reject'].includes(action)) {
      console.log(`${logPrefix} Invalid action: ${action}`);
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_email)) {
      console.log(`${logPrefix} Invalid email format: ${admin_email}`);
      return res.status(400).json({ error: 'Invalid email format for admin_email' });
    }

    // Tìm report
    const report = await Report.findById(reportId);
    if (!report) {
      console.log(`${logPrefix} Report not found for reportId=${reportId}`);
      return res.status(404).json({ error: 'Report not found' });
    }

    // Kiểm tra trạng thái
    if (report.status !== 'pending') {
      console.log(`${logPrefix} Report already processed for reportId=${reportId}`);
      return res.status(400).json({ error: 'Report already completed' });
    }

    // Tìm prediction
    const prediction = await Prediction.findById(report.prediction_id).lean();
    if (!prediction) {
      console.log(`${logPrefix} Prediction not found for prediction_id=${report.prediction_id}`);
      return res.status(404).json({ error: 'Prediction not found' });
    }

    // Tìm workflow run
    const workflowRun = await WorkflowRun.findOne({ github_run_id: report.github_run_id }).lean();
    if (!workflowRun) {
      console.log(`${logPrefix} WorkflowRun not found for github_run_id=${report.github_run_id}`);
      return res.status(404).json({ error: 'WorkflowRun not found' });
    }

    // Cập nhật trạng thái report
    report.status = action === 'approve' ? 'approved' : 'rejected';

    // Nếu approve, cập nhật dataset
    if (action === 'approve') {
      const ciBuildsResponse = await axios.get(`${process.env.GHTORRENT_API_URL}/ci_builds_from_run`, {
        params: {
          project_name: report.project_name,
          branch: report.branch,
          timestamp: workflowRun.run_started_at.toISOString(),
        },
      });
      const ci_builds = ciBuildsResponse.data.ci_builds || [];

      await updateMLDataset(prediction.model_name, ci_builds); // Cập nhật dataset ML
      console.log(`${logPrefix} Dataset updated for reportId=${reportId}`);
    }

    await report.save();

    console.log(`${logPrefix} Action: ${action} processed for reportId=${reportId}`);
    res.status(200).json({ message: `Report ${action}ed successfully`, reportId });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.getAllReports = async (req, res, next) => {
  const logPrefix = '[getAllReports]';
  try {
    const reports = await Report.find().sort({ reported_at: -1 }).lean();
    res.status(200).json(reports.map(report => ({
      id: report._id.toString(),
      github_run_id: report.github_run_id,
      prediction_id: report.prediction_id,
      project_name: report.project_name,
      branch: report.branch,
      reported_by: report.reported_by,
      status: report.status,
      reported_at: report.reported_at,
    })));

    console.log(`${logPrefix} Retrieved ${reports.length} reports`);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.deleteReport = async (req, res, next) => {
  const logPrefix = '[deleteReport]';
  try {
    const { reportId } = req.params;

    if (!reportId) {
      console.log(`${logPrefix} Missing reportId`);
      return res.status(400).json({ error: 'Missing reportId' });
    }

    const report = await Report.findByIdAndDelete(reportId);
    if (!report) {
      console.log(`${logPrefix} Report not found for reportId=${reportId}`);
      return res.status(404).json({ error: 'Report not found' });
    }

    console.log(`${logPrefix} Report deleted for reportId=${reportId}`);
    res.status(200).json({ message: 'Report deleted successfully', reportId });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};