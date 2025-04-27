const Repo = require('../models/Repo');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const WebhookUser = require('../models/WebhookUser');
const { callRubyAPI } = require('../utils/rubyClient');

exports.handleWorkflowRun = async (req, res, next) => {
  const logPrefix = '[handleWorkflowRun]';
  console.log(`${logPrefix} Received webhook request`);

  try {
    // Lấy URL webhook từ request
    const webhookUrl = req.originalUrl;
    console.log(`${logPrefix} Webhook URL: ${webhookUrl}`);

    // Tìm user_id dựa trên webhook URL
    const webhookUser = await WebhookUser.findOne({ webhook_url: webhookUrl }).populate('user_id');
    if (!webhookUser) {
      console.warn(`${logPrefix} No user found for webhook URL: ${webhookUrl}`);
      return res.status(404).json({ error: 'User not found for this webhook', code: 'USER_NOT_FOUND' });
    }

    const user_id = webhookUser.user_id._id;
    console.log(`${logPrefix} Processing for user: ${user_id}`);

    // Lấy danh sách tất cả repos của user
    const repos = await Repo.find({ user_id });
    if (!repos || repos.length === 0) {
      console.warn(`${logPrefix} No repositories found for user: ${user_id}`);
      return res.status(404).json({ error: 'No repositories found for this user', code: 'NO_REPOS_FOUND' });
    }

    // Gọi /retrieve cho từng repo để cập nhật DB ghtorrent
    for (const repo of repos) {
      const url = `https://github.com/${repo.owner.login}/${repo.name}`;
      const token = repo.decryptToken();

      console.log(`${logPrefix} Calling /retrieve for repo: ${url}`);
      await callRubyAPI('/retrieve', 'POST', { url, token });
    }

    // Đồng bộ dữ liệu từ DB ghtorrent vào DB app
    for (const repo of repos) {
      const owner = repo.owner.login;
      const repo_name = repo.name;

      console.log(`${logPrefix} Syncing data for repo: ${repo_name}`);
      const rubyData = await callRubyAPI(`/sync-data?owner=${owner}&repo=${repo_name}`, 'GET');
      const { workflows: workflowsData, workflow_runs: runsData } = rubyData;

      // Chuẩn bị bulk operations cho workflows
      const workflowOps = [];
      const workflowIdMap = new Map();

      for (const workflow of workflowsData) {
        if (!workflow.github_id) {
          console.warn(`${logPrefix} Workflow github_id not found in response: ${JSON.stringify(workflow)}`);
          continue;
        }

        workflowOps.push({
          updateOne: {
            filter: { user_id, repo_id: repo._id, github_workflow_id: workflow.github_id },
            update: {
              $set: {
                user_id,
                github_workflow_id: workflow.github_id, // Lưu github_id từ ghtorrent
                repo_id: repo._id,
                name: workflow.name,
                path: workflow.path,
                state: workflow.state,
                created_at: new Date(workflow.created_at),
                updated_at: new Date(workflow.updated_at),
              },
            },
            upsert: true,
          },
        });
      }

      if (workflowOps.length > 0) {
        console.log(`${logPrefix} Executing bulk write for ${workflowOps.length} workflows in repo ${repo_name}`);
        await Workflow.bulkWrite(workflowOps);
      }

      // Lấy lại workflows để ánh xạ github_workflow_id sang _id
      const savedWorkflows = await Workflow.find({ user_id, repo_id: repo._id });
      for (const wf of savedWorkflows) {
        workflowIdMap.set(wf.github_workflow_id, wf._id); // Ánh xạ github_workflow_id -> MongoDB _id
      }

      // Chuẩn bị bulk operations cho workflow runs
      const runOps = [];
      for (const run of runsData) {
        if (!run.workflow_id || !run.github_id) {
          console.warn(`${logPrefix} Workflow run data incomplete: ${JSON.stringify(run)}`);
          continue;
        }

        // Tìm _id của Workflow dựa trên workflow_id (github_id của workflow)
        const workflowMongoId = workflowIdMap.get(Number(run.workflow_id));
        if (!workflowMongoId) {
          console.warn(`${logPrefix} Workflow ${run.workflow_id} not found for run ${run.github_id} in repo ${repo_name}`);
          continue;
        }

        runOps.push({
          updateOne: {
            filter: { user_id, github_run_id: run.github_id },
            update: {
              $set: {
                user_id,
                github_run_id: run.github_id, // Lưu github_id của run
                github_workflow_id: run.workflow_id, // Lưu github_id của workflow từ ghtorrent
                workflow_id: workflowMongoId, // Tham chiếu đến _id của Workflow
                name: run.name,
                head_branch: run.head_branch,
                head_sha: run.head_sha,
                run_number: run.run_number,
                status: run.status,
                conclusion: run.conclusion || null, // Đảm bảo conclusion có thể là null
                created_at: new Date(run.created_at),
                run_started_at: new Date(run.run_started_at),
                updated_at: new Date(run.updated_at),
              },
            },
            upsert: true,
          },
        });
      }

      if (runOps.length > 0) {
        console.log(`${logPrefix} Executing bulk write for ${runOps.length} workflow runs in repo ${repo_name}`);
        await WorkflowRun.bulkWrite(runOps);
      }
    }

    console.log(`${logPrefix} Webhook processed successfully for user ${user_id}`);
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};