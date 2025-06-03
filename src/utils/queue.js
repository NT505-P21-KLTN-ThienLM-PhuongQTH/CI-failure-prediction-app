const axios = require('axios');
const Repo = require('../models/Repo');
const RepoData = require('../models/RepoData');
const syncWorkflowsAndRuns = require('./syncWorkflowsAndRuns');
const { retrieveQueue, syncQueue } = require('../config/redis');
const { encryptToken } = require('./utils');

// Hàm xử lý logic cho retrieveQueue
const processRepoUpdate = async (job) => {
  const { repoId, url, token, owner, repo, logPrefix } = job.data;
  try {
    const repoCheck = await Repo.findById(repoId);
    if (!repoCheck || repoCheck.status !== 'Pending') {
      console.log(`${logPrefix} Repository ${owner}/${repo} is no longer in Pending state. Skipping API call.`);
      return;
    }

    console.log(`${logPrefix} Calling /retrieve for ${owner}/${repo}`);
    const retrieveResponse = await axios.post(
      `${process.env.GHTORRENT_API_URL}/retrieve`,
      { url, token },
      { timeout: 600000, headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`${logPrefix} /retrieve response:`, retrieveResponse.data);

    if (retrieveResponse.status !== 200) {
      throw new Error(`Failed to retrieve repository from GitHub: ${retrieveResponse.statusText}`);
    }

    const retrieveData = retrieveResponse.data;
    if (retrieveData.status !== 'success') {
      throw new Error(retrieveData.message || 'Retrieve API failed');
    }

    console.log(`${logPrefix} Calling /repos/${owner}/${repo}`);
    const repoResponse = await axios.get(
      `${process.env.GHTORRENT_API_URL}/repos/${owner}/${repo}`,
      { timeout: 600000 }
    );

    console.log(`${logPrefix} /repos response:`, repoResponse.data);

    if (repoResponse.status !== 200) {
      throw new Error(`Failed to fetch repository details from ghtorrent: ${repoResponse.statusText}`);
    }

    const repoDetails = repoResponse.data;

    if (!repoDetails.id) {
      throw new Error('Repository ID not found in response');
    }

    const encryptedToken = encryptToken(token);

    try {
      const updatedRepo = await Repo.findOneAndUpdate(
        { _id: repoId },
        {
          full_name: repoDetails.full_name || `${owner}/${repo}`,
          name: repoDetails.name,
          token: encryptedToken,
          status: 'Success',
          html_url: repoDetails.html_url || url,
        },
        { new: true }
      );
      console.log("Repository updated:", updatedRepo);
    } catch (error) {
      throw new Error('Failed to update repository in database ' + error.message);
    }

    // Kiểm tra xem RepoData đã tồn tại hay chưa
    let repoData = await RepoData.findOne({ repo_id: repoId });

    if (repoData) {
      // Nếu đã tồn tại, cập nhật thông tin từ repoDetails
      repoData = await RepoData.findOneAndUpdate(
        { repo_id: repoId },
        {
          github_repo_id: repoDetails.id,
          full_name: repoDetails.full_name || `${owner}/${repo}`,
          name: repoDetails.name,
          html_url: repoDetails.html_url || url,
          owner: {
            id: repoDetails.owner.id,
            login: repoDetails.owner.login,
            avatar_url: repoDetails.owner.avatar_url,
          },
          private: repoDetails.private,
          homepage: repoDetails.homepage,
          pushed_at: repoDetails.pushed_at ? new Date(repoDetails.pushed_at) : null,
          default_branch: repoDetails.default_branch,
          language: repoDetails.language,
          stargazers_count: repoDetails.stargazers_count,
          forks_count: repoDetails.forks_count,
          watchers_count: repoDetails.watchers_count,
          open_issues_count: repoDetails.open_issues_count,
          permissions: {
            admin: repoDetails.permissions ? repoDetails.permissions.admin : false,
            push: repoDetails.permissions ? repoDetails.permissions.push : false,
            pull: repoDetails.permissions ? repoDetails.permissions.pull : false,
          },
          created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
          updated_at: repoDetails.updated_at ? new Date(repoDetails.updated_at) : null,
        },
        { new: true }
      );
      console.log(`${logPrefix} Updated existing RepoData for repo ${repoId}`);
    } else {
      // Nếu chưa tồn tại, tạo mới RepoData
      repoData = new RepoData({
        repo_id: repoId,
        github_repo_id: repoDetails.id,
        full_name: repoDetails.full_name || `${owner}/${repo}`,
        name: repoDetails.name,
        html_url: repoDetails.html_url || url,
        owner: {
          id: repoDetails.owner.id,
          login: repoDetails.owner.login,
          avatar_url: repoDetails.owner.avatar_url,
        },
        private: repoDetails.private,
        homepage: repoDetails.homepage,
        pushed_at: repoDetails.pushed_at ? new Date(repoDetails.pushed_at) : null,
        default_branch: repoDetails.default_branch,
        language: repoDetails.language,
        stargazers_count: repoDetails.stargazers_count,
        forks_count: repoDetails.forks_count,
        watchers_count: repoDetails.watchers_count,
        open_issues_count: repoDetails.open_issues_count,
        permissions: {
          admin: repoDetails.permissions ? repoDetails.permissions.admin : false,
          push: repoDetails.permissions ? repoDetails.permissions.push : false,
          pull: repoDetails.permissions ? repoDetails.permissions.pull : false,
        },
        created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
        updated_at: repoDetails.updated_at ? new Date(repoDetails.updated_at) : null,
      });
      await repoData.save();
      console.log(`${logPrefix} Created new RepoData for repo ${repoId}`);
    }

    console.log(`${logPrefix} Repository processed successfully: ${repoCheck.full_name}`);

    // Đẩy công việc đồng bộ workflows và runs vào syncQueue
    await syncQueue.add({
      user_id: repoCheck.user_id,
      repoData,
      logPrefix,
    });
  } catch (error) {
    console.error(`${logPrefix} Error in retrieveQueue: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`${logPrefix} Response status: ${error.response.status}`);
    }
    if (error.request) {
      console.error(`${logPrefix} No response received from server`);
    }
    console.error(`${logPrefix} Error stack: ${error.stack}`);

    await Repo.findByIdAndUpdate(repoId, { status: 'Failed' });
  }
};

// Worker xử lý syncQueue
const processSyncQueue = async (job) => {
  const { user_id, repoData, logPrefix } = job.data;
  try {
    console.log(`${logPrefix} Syncing workflows and runs for repository ${repoData.full_name}`);
    await syncWorkflowsAndRuns(user_id, repoData, logPrefix);
    console.log(`${logPrefix} Successfully synced workflows and runs for ${repoData.full_name}`);
  } catch (error) {
    console.error(`${logPrefix} Error in syncQueue: ${error.message}`);
    console.error(`${logPrefix} Error stack: ${error.stack}`);
  }
};

// Đăng ký worker cho các queue
retrieveQueue.process(processRepoUpdate);
syncQueue.process(processSyncQueue);

module.exports = { retrieveQueue, syncQueue };