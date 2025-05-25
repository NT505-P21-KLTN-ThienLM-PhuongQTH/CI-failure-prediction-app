const axios = require('axios');
const mongoose = require('mongoose');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const Commit = require('../models/Commit');
const Prediction = require('../models/Prediction');

const syncWorkflowsAndRuns = async (user_id, repo, logPrefix) => {
  let owner = 'unknown';
  let repoName = 'unknown';
  try {
    if (!process.env.GHTORRENT_API_URL) {
      throw new Error('GHTORRENT_API_URL environment variable is not set');
    }
    console.log(`Using GHTORRENT_API_URL: ${process.env.GHTORRENT_API_URL}`);

    owner = repo.owner.login;
    repoName = repo.name;

    console.log(`${logPrefix} Syncing workflows for owner: ${owner}, repo: ${repoName}`);

    // Lấy danh sách workflows
    const workflowsResponse = await axios.get(
      `${process.env.GHTORRENT_API_URL}/workflows?owner=${owner}&repo=${repoName}`,
      { timeout: 600000 }
    );

    if (workflowsResponse.status !== 200) {
      throw new Error(`Failed to fetch workflows for ${owner}/${repoName}: ${workflowsResponse.statusText}`);
    }

    const workflows = workflowsResponse.data;
    console.log(`${logPrefix} Workflows for ${owner}/${repoName}:`, workflows);

    const workflowIdMap = new Map();

    for (const workflow of workflows) {
      if (!workflow.github_id) {
        console.warn(`${logPrefix} Workflow github_id not found in response: ${JSON.stringify(workflow)}`);
        continue;
      }

      console.log(`${logPrefix} Saving workflow: ${workflow.github_id}`);
      const updatedWorkflow = await Workflow.findOneAndUpdate(
        { user_id: new mongoose.Types.ObjectId(String(user_id)), repo_id: repo.repo_id, github_workflow_id: workflow.github_id },
        {
          user_id: new mongoose.Types.ObjectId(String(user_id)),
          github_workflow_id: workflow.github_id,
          repo_id: repo.repo_id,
          name: workflow.name,
          path: workflow.path,
          state: workflow.state,
          created_at: new Date(workflow.created_at),
          updated_at: new Date(workflow.updated_at),
          html_url: workflow.html_url,
        },
        { upsert: true, new: true }
      );
      workflowIdMap.set(Number(workflow.github_id), updatedWorkflow._id);
    }

    console.log(`${logPrefix} Syncing workflow runs for owner: ${owner}, repo: ${repoName}`);

    // Lấy danh sách workflow runs
    const runsResponse = await axios.get(
      `${process.env.GHTORRENT_API_URL}/workflow_runs?owner=${owner}&repo=${repoName}`,
      { timeout: 600000 }
    );

    if (runsResponse.status !== 200) {
      throw new Error(`Failed to fetch workflow runs for ${owner}/${repoName}: ${runsResponse.statusText}`);
    }

    const runs = runsResponse.data;
    console.log(`${logPrefix} Workflow runs for ${owner}/${repoName}:`, runs);

    for (const run of runs) {
      if (!run.workflow_id || !run.github_id) {
        console.warn(`${logPrefix} Workflow run data incomplete: ${JSON.stringify(run)}`);
        continue;
      }

      const workflowMongoId = workflowIdMap.get(Number(run.workflow_id));
      if (!workflowMongoId) {
        console.warn(`${logPrefix} Workflow ${run.workflow_id} not found for run ${run.github_id} in repo ${repoName}`);
        continue;
      }

      console.log(`${logPrefix} Saving workflow run: ${run.github_id}`);
      const updatedRun = await WorkflowRun.findOneAndUpdate(
        { user_id: new mongoose.Types.ObjectId(String(user_id)), github_run_id: run.github_id },
        {
          $set: {
            user_id: new mongoose.Types.ObjectId(String(user_id)),
            github_run_id: run.github_id,
            github_workflow_id: run.workflow_id,
            workflow_id: workflowMongoId,
            repo_id: repo.repo_id,
            name: run.name,
            head_branch: run.head_branch,
            head_sha: run.head_sha,
            run_number: run.run_number,
            status: run.status,
            conclusion: run.conclusion || null,
            created_at: new Date(run.created_at),
            run_started_at: new Date(run.run_started_at),
            updated_at: new Date(run.updated_at),
            event: run.event,
            path: run.path,
            run_attempt: run.run_attempt,
            display_title: run.display_title,
            html_url: run.html_url,
            actor: {
              login: run.actor.login,
              avatar_url: run.actor.avatar_url || null,
              html_url: run.actor.html_url || null,
            },
            triggering_actor: {
              login: run.triggering_actor.login,
              avatar_url: run.triggering_actor.avatar_url || null,
              html_url: run.triggering_actor.html_url || null,
            },
          },
        },
        { upsert: true, new: true }
      );

      // Cập nhật actual_result cho Prediction
      if (run.conclusion) {
        console.log(`${logPrefix} Updating prediction actual_result for github_run_id: ${run.github_id}`);
        const actual_result = run.conclusion !== 'success';
        const prediction = await Prediction.findOneAndUpdate(
            { github_run_id: run.github_id },
            {
              $set: {
                actual_result,
              },
            },
            { new: true }
          );

          if (prediction) {
            console.log(`${logPrefix} Prediction actual_result updated for github_run_id=${run.github_id} in ${owner}/${repoName}: ${actual_result}`);
          } else {
            console.warn(`${logPrefix} No prediction found for github_run_id=${run.github_id} in ${owner}/${repoName}, workflow_id=${run.workflow_id}`);
          }
      }

      // Lưu commit nếu có
      if (run.commit) {
        console.log(`${logPrefix} Saving commit for workflow run: ${run.github_id}`);
        await Commit.findOneAndUpdate(
          { user_id: new mongoose.Types.ObjectId(String(user_id)), workflow_run_id: updatedRun._id, sha: run.commit.sha },
          {
            user_id: new mongoose.Types.ObjectId(String(user_id)),
            workflow_run_id: updatedRun._id,
            sha: run.commit.sha,
            commit: {
              author: {
                name: run.commit.commit.author.name,
                email: run.commit.commit.author.email,
                date: new Date(run.commit.commit.author.date),
              },
              message: run.commit.commit.message,
            },
            author: {
              login: run.commit.author.login,
              avatar_url: run.commit.author.avatar_url || null,
              html_url: run.commit.author.html_url || null,
            },
            html_url: run.commit.html_url,
            stats: {
              total: run.commit.stats.total,
              additions: run.commit.stats.additions,
              deletions: run.commit.stats.deletions,
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    console.log(`${logPrefix} Workflows, runs, commits, and predictions synced successfully for ${owner}/${repoName}`);
  } catch (error) {
    console.error(`${logPrefix} Error syncing workflows, runs, commits, and predictions for ${owner}/${repoName}: ${error.message}`);
    throw error;
  }
};

module.exports = syncWorkflowsAndRuns;