const axios = require('axios');
const mongoose = require('mongoose');
const Repo = require('../models/Repo');
const WebhookUser = require('../models/WebhookUser');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const syncWorkflowsAndRuns = require('../utils/syncWorkflowsAndRuns');

exports.handleWorkflowRun = async (req, res, next) => {
  const logPrefix = '[handleWorkflowRun]';
  console.log(`${logPrefix} Received webhook request`);

  try {
    const webhookUrl = req.originalUrl;
    console.log(`${logPrefix} Webhook URL: ${webhookUrl}`);

    const webhookUser = await WebhookUser.findOne({ webhook_url: webhookUrl }).populate('user_id');
    if (!webhookUser) {
      console.warn(`${logPrefix} No user found for webhook URL: ${webhookUrl}`);
      return res.status(404).json({ error: 'User not found for this webhook', code: 'USER_NOT_FOUND' });
    }

    const user_id = webhookUser.user_id._id.toString();
    console.log(`${logPrefix} Processing for user: ${user_id}`);

    const payload = req.body;
    console.log(`${logPrefix} Webhook payload:`, JSON.stringify(payload, null, 2));

    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      console.warn(`${logPrefix} Repository full_name not found in webhook payload`);
      return res.status(400).json({ error: 'Repository information missing in webhook payload', code: 'MISSING_REPO_INFO' });
    }

    const repo = await Repo.findOne({ user_id: new mongoose.Types.ObjectId(user_id), full_name: repoFullName });
    if (!repo) {
      console.warn(`${logPrefix} Repository ${repoFullName} not found for user ${user_id}`);
      return res.status(404).json({ error: 'Repository not found', code: 'REPO_NOT_FOUND' });
    }

    console.log(`${logPrefix} Processing webhook for repository: ${repoFullName}`);

    const url = `https://github.com/${repo.owner.login}/${repo.name}`;
    const token = repo.decryptToken();

    console.log(`${logPrefix} Calling /retrieve for repo: ${url}`);
    const retrieveResponse = await axios.post(
      'http://localhost:4567/retrieve',
      { url, token },
      {
        timeout: 600000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (retrieveResponse.status !== 200 || retrieveResponse.data.status !== 'success') {
      throw new Error(`Failed to retrieve repository ${repoFullName}: ${retrieveResponse.statusText || retrieveResponse.data.message}`);
    }

    console.log(`${logPrefix} /retrieve successful for ${repoFullName}`);

    await syncWorkflowsAndRuns(user_id, repo, logPrefix);

    console.log(`${logPrefix} Webhook processed successfully for repository ${repoFullName}`);
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`${logPrefix} Response status: ${error.response.status}`);
    }
    if (error.request) {
      console.error(`${logPrefix} No response received from server`);
    }
    console.error(`${logPrefix} Error stack: ${error.stack}`);
    next(error);
  }
};

// API để lấy danh sách nhánh có workflow runs
exports.getBranchesWithRuns = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;

    if (!user_id || !repo_id) {
      return res.status(400).json({ error: 'Missing user_id or repo_id' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const branches = await WorkflowRun.distinct('head_branch', {
      user_id: userIdObject,
      repo_id: repo._id,
    });

    res.status(200).json(branches);
  } catch (error) {
    console.error('Error in getBranchesWithRuns:', error);
    next(error);
  }
};

exports.getWorkflows = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;

    if (!user_id || !repo_id || !branch) {
      return res.status(400).json({ error: 'Missing user_id, repo_id, or branch' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Lấy tất cả workflows của repository
    const workflows = await Workflow.find({
      user_id: userIdObject,
      repo_id: repoIdObject,
    }).lean();

    // Lấy danh sách workflow_ids có workflow_runs trên nhánh được chọn
    const workflowRuns = await WorkflowRun.find({
      user_id: userIdObject,
      repo_id: repoIdObject,
      head_branch: branch,
    }).distinct('workflow_id');

    // Chỉ giữ lại các workflows có workflow_runs trên nhánh được chọn
    const filteredWorkflows = workflows.filter(workflow =>
      workflowRuns.some(workflowId => workflowId.toString() === workflow._id.toString())
    );

    res.status(200).json(filteredWorkflows.map(workflow => ({
      id: workflow._id.toString(),
      github_workflow_id: workflow.github_workflow_id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      html_url: workflow.html_url,
    })));
  } catch (error) {
    console.error('Error in getWorkflows:', error);
    next(error);
  }
};

exports.getWorkflowDetails = async (req, res, next) => {
  try {
    const workflow_id = req.params.id;

    if (!workflow_id) {
      return res.status(400).json({ error: 'Missing workflow_id' });
    }

    const workflowIdObject = new mongoose.Types.ObjectId(workflow_id);
    const workflow = await Workflow.findOne({ _id: workflowIdObject }).lean();
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.status(200).json({
      id: workflow._id.toString(),
      github_workflow_id: workflow.github_workflow_id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      html_url: workflow.html_url,
    });
  } catch (error) {
    console.error('Error in getWorkflowDetails:', error);
    next(error);
  }
}

exports.getPipelineData = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;
    const workflow_id = req.query.workflow_id;
    const timeUnit = req.query.timeUnit || 'day';
    const recentDays = parseInt(req.query.recentDays) || 10; // Số ngày tối đa (ở đây là 10)

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const query = { user_id: userIdObject };
    if (repo_id) {
      const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
      const repo = await Repo.findOne({ _id: repoIdObject, user_id: userIdObject });
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      query.repo_id = repo._id;
    }

    if (branch) {
      query.head_branch = branch;
    }

    if (workflow_id) {
      const workflowIdObject = new mongoose.Types.ObjectId(String(workflow_id));
      query.workflow_id = workflowIdObject;
    }

    // Lấy tất cả workflow runs theo điều kiện, sắp xếp theo created_at giảm dần (mới nhất trước)
    const runs = await WorkflowRun.find(query)
      .sort({ created_at: -1 }) // Sắp xếp giảm dần theo thời gian
      .lean();

    if (runs.length === 0) {
      return res.status(200).json([]); // Trả về mảng rỗng nếu không có dữ liệu
    }

    // Gom nhóm dữ liệu theo thời gian (theo ngày, tuần, hoặc tháng)
    const groupedData = {};
    let uniqueDays = new Set(); // Lưu trữ các ngày duy nhất có build

    runs.forEach((run) => {
      const date = new Date(run.created_at);
      let timeText;

      if (timeUnit === 'day') {
        timeText = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (timeUnit === 'week') {
        const week = Math.ceil(date.getDate() / 7);
        timeText = `Week ${week} ${date.getFullYear()}`;
      } else {
        timeText = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      }

      // Chỉ thêm vào groupedData nếu chưa đủ 10 ngày duy nhất
      if (timeUnit === 'day' && uniqueDays.size < recentDays) {
        uniqueDays.add(timeText);
      } else if (timeUnit === 'day' && !uniqueDays.has(timeText)) {
        return; // Bỏ qua nếu đã đủ 10 ngày duy nhất
      }

      if (!groupedData[timeText]) {
        groupedData[timeText] = {
          success: 0,
          failed: 0,
          date: date.toISOString(),
        };
      }

      if (run.conclusion === 'success') {
        groupedData[timeText].success += 1;
      } else if (run.conclusion === 'failure') {
        groupedData[timeText].failed += 1;
      }
    });

    // Chuyển dữ liệu thành mảng và sắp xếp theo ngày
    let pipelineData = Object.keys(groupedData).map((timeText) => ({
      timeText,
      success: groupedData[timeText].success,
      failed: groupedData[timeText].failed,
      date: groupedData[timeText].date,
    }));

    // Sắp xếp lại theo ngày tăng dần (để hiển thị biểu đồ từ trái sang phải: cũ -> mới)
    pipelineData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Tính tỷ lệ phần trăm
    const result = pipelineData.map((item) => {
      const total = item.success + item.failed;
      const successRate = total > 0 ? (item.success / total) * 100 : 0;
      const failedRate = total > 0 ? (item.failed / total) * 100 : 0;

      return {
        timeText: item.timeText,
        success: item.success,
        failed: item.failed,
        successRate: parseFloat(successRate.toFixed(2)), // Tỷ lệ thành công
        failedRate: parseFloat(failedRate.toFixed(2)), // Tỷ lệ thất bại
        date: item.date,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getPipelineData:', error);
    next(error);
  }
};

exports.getPipelineStats = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    const repo_id = req.query.repo_id;
    const branch = req.query.branch;
    const workflow_id = req.query.workflow_id;

    if (!user_id || !repo_id || !branch) {
      return res.status(400).json({ error: 'Missing user_id, repo_id, or branch' });
    }

    const userIdObject = new mongoose.Types.ObjectId(String(user_id));
    const repoIdObject = new mongoose.Types.ObjectId(String(repo_id));
    
    // Query cơ bản
    const query = {
      user_id: userIdObject,
      repo_id: repoIdObject,
      head_branch: branch,
    };

    if (workflow_id) {
      const workflowIdObject = new mongoose.Types.ObjectId(String(workflow_id));
      query.workflow_id = workflowIdObject;
    }

    // 1. Lấy dữ liệu hiện tại (tất cả runs)
    const runs = await WorkflowRun.find(query).lean();

    const totalPipelines = runs.length;
    const successRuns = runs.filter(run => run.conclusion === 'success').length;
    const failedRuns = runs.filter(run => run.conclusion === 'failure').length;

    // Tính success rate hiện tại
    const successRate = totalPipelines > 0 ? (successRuns / totalPipelines) * 100 : 0;

    // Tính thời gian chạy trung bình (giả định run_duration tính bằng giây)
    const totalRunTime = runs.reduce((sum, run) => {
      const startTime = new Date(run.run_started_at).getTime();
      const endTime = new Date(run.updated_at).getTime();
      const duration = (endTime - startTime) / 1000;
      return sum + (duration > 0 ? duration : 0);
    }, 0);
    const averageRunTime = totalPipelines > 0 ? totalRunTime / totalPipelines : 0;

    // 2. Lấy dữ liệu từ 30 ngày trước để so sánh
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const previousQuery = {
      ...query,
      run_started_at: { $lt: thirtyDaysAgo },
    };

    const previousRuns = await WorkflowRun.find(previousQuery).lean();

    const previousTotalRuns = previousRuns.length;
    const previousSuccessRuns = previousRuns.filter(run => run.conclusion === 'success').length;
    const previousFailedRuns = previousRuns.filter(run => run.conclusion === 'failure').length;

    // Tính success rate trước đó
    const previousSuccessRate = previousTotalRuns > 0 ? (previousSuccessRuns / previousTotalRuns) * 100 : 0;

    // Tính sự thay đổi
    const successRateChange = successRate - previousSuccessRate;
    const failedBuildsChange = previousTotalRuns > 0 ? ((failedRuns - previousFailedRuns) / previousTotalRuns) * 100 : 0;

    // 3. Tính last_failure (thời gian kể từ lần thất bại cuối cùng)
    const lastFailedRun = await WorkflowRun.findOne({
      ...query,
      conclusion: 'failure',
    })
      .sort({ updated_at: -1 })
      .lean();

    let lastFailure = null;
    if (lastFailedRun) {
      const lastFailureDate = new Date(lastFailedRun.updated_at);
      const now = new Date();
      const diffTime = now - lastFailureDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      lastFailure = diffDays;
    }

    // 4. Tính recent_failures (số lượng build thất bại trong 7 ngày gần nhất)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentFailedRuns = await WorkflowRun.countDocuments({
      ...query,
      conclusion: 'failure',
      updated_at: { $gte: sevenDaysAgo },
    });

    // Trả về kết quả
    res.status(200).json({
      total_pipelines: totalPipelines,
      success_rate: parseFloat(successRate.toFixed(2)),
      failed_builds: failedRuns,
      average_run_time: parseFloat(averageRunTime.toFixed(2)),
      success_rate_change: parseFloat(successRateChange.toFixed(2)),
      failed_builds_change: parseFloat(failedBuildsChange.toFixed(2)),
      last_failure: lastFailure !== null ? lastFailure : null,
      recent_failures: recentFailedRuns,
    });
  } catch (error) {
    console.error('Error in getPipelineStats:', error);
    next(error);
  }
};