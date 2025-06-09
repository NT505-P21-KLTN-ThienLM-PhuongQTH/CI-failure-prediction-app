const axios = require('axios');
const Redis = require('ioredis');
const Repo = require('../models/Repo');
const RepoData = require('../models/RepoData');
const syncWorkflowsAndRuns = require('./syncWorkflowsAndRuns');
const { retrieveQueue, syncQueue } = require('../config/redis');
const { encryptToken } = require('./utils');
const { v4: uuidv4 } = require('uuid');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

const axiosInstance = axios.create({
  timeout: 30000, // Timeout 30s
  headers: { 'Content-Type': 'application/json' }
});

// Retry logic
const retryRequest = async (config, maxRetries = 5, delay = 500) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axiosInstance(config);
    } catch (err) {
      if (attempt === maxRetries || !err.response || ![502, 503, 504].includes(err.response?.status)) {
        throw err;
      }
      console.log(`Retrying request (${attempt}/${maxRetries}) after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
};

const processRepoUpdate = async (job) => {
  const { repoId, url, token, owner, repo, logPrefix } = job.data;
  try {
    const repoCheck = await Repo.findById(repoId);
    if (!repoCheck || repoCheck.status !== 'Pending') {
      console.log(`${logPrefix} Repository ${owner}/${repo} is no longer in Pending state.`);
      return;
    }

    const requestId = uuidv4();

    console.log(`${logPrefix} Calling POST /retrieve for ${owner}/${repo}`);
    const retrieveResponse = await retryRequest({
      method: 'post',
      url: `${process.env.GHTORRENT_API_URL}/retrieve`,
      data: { url, token, request_id: requestId }
    });

    console.log(`${logPrefix} POST /retrieve response: ${JSON.stringify(retrieveResponse.data, null, 2)}`);

    if (retrieveResponse.status !== 202 || retrieveResponse.data.status !== 'accepted') {
      throw new Error(retrieveResponse.data?.message || 'Retrieve API failed');
    }

    await Repo.findByIdAndUpdate(repoId, { request_id: requestId, status: 'Queued' });

    console.log(`${logPrefix} Retrieve request queued with ID: ${requestId}`);
  } catch (error) {
    console.error(`${logPrefix} Error in retrieveQueue: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      console.error(`${logPrefix} Response status: ${error.response.status}`);
    }
    if (error.request) {
      console.error(`${logPrefix} No response received from server`);
    }
    console.error(`${logPrefix} Error stack: ${error.stack}`);

    await Repo.findByIdAndUpdate(repoId, { status: 'Failed' });
    throw error;
  }
};

redis.subscribe('retrieve_results', (err, count) => {
  if (err) {
    console.error('Failed to subscribe to retrieve_results:', err);
  } else {
    console.log(`Subscribed to retrieve_results channel (${count})`);
  }
});

redis.on('message', async (channel, message) => {
  if (channel !== 'retrieve_results') return;

  const logPrefix = `[Redis ${channel}]`;
  const { request_id, status, data, error } = JSON.parse(message);
  console.log(`${logPrefix} Received message: ${message}`);

  try {
    const repo = await Repo.findOne({ request_id });
    if (!repo) {
      console.error(`${logPrefix} Repo not found for request_id: ${request_id}`);
      await Repo.findOneAndUpdate({ request_id }, { status: 'Failed' });
      return;
    }

    if (status !== 'success') {
      console.error(`${logPrefix} Retrieve failed: ${error || 'Unknown error'}`);
      await Repo.findByIdAndUpdate(repo._id, { status: 'Failed' });
      return;
    }

    const [owner, repoName] = repo.full_name.split('/');
    if (!owner || !repoName) {
      throw new Error(`Invalid full_name format: ${repo.full_name}`);
    }

    const { url } = repo;

    let repoDetails = data;
    if (!repoDetails || !repoDetails.id || !repoDetails.owner?.login) {
      console.log(`${logPrefix} Calling GET /repos/${owner}/${repoName} due to incomplete data`);
      const repoResponse = await retryRequest({
        method: 'get',
        url: `${process.env.GHTORRENT_API_URL}/repos/${owner}/${repoName}`
      });

      console.log(`${logPrefix} GET /repos response: ${JSON.stringify(repoResponse.data, null, 2)}`);

      if (repoResponse.status !== 200) {
        throw new Error(`Failed to fetch repository: ${repoResponse.statusText}`);
      }

      repoDetails = repoResponse.data;
    }

    if (!repoDetails?.id) {
      throw new Error('Repository ID missing');
    }

    const updatedRepo = await Repo.findOneAndUpdate(
      { _id: repo._id },
      {
        full_name: repoDetails.full_name || repo.full_name,
        name: repoDetails.name || repoName,
        status: 'Success',
        html_url: repoDetails.html_url || url,
      },
      { new: true }
    );
    console.log(`${logPrefix} Repository updated:`, updatedRepo);

    let repoData = await RepoData.findOne({ repo_id: repo._id });

    if (repoData) {
      repoData = await RepoData.findOneAndUpdate(
        { repo_id: repo._id },
        {
          github_repo_id: repoDetails.id,
          full_name: repoDetails.full_name || repo.full_name,
          name: repoDetails.name || repoName,
          html_url: repoDetails.html_url || url,
          owner: {
            id: repoDetails.owner?.id,
            login: repoDetails.owner?.login || owner,
            avatar_url: repoDetails.owner?.avatar_url,
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
            admin: repoDetails.permissions?.admin ?? false,
            push: repoDetails.permissions?.push ?? false,
            pull: repoDetails.permissions?.pull ?? false,
          },
          created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
          updated_at: repoDetails.updated_at ? new Date(repoDetails.updated_at) : null,
        },
        { new: true }
      );
      console.log(`${logPrefix} Updated existing RepoData`);
    } else {
      repoData = new RepoData({
        repo_id: repo._id,
        github_repo_id: repoDetails.id,
        full_name: repoDetails.full_name || repo.full_name,
        name: repoDetails.name || repoName,
        html_url: repoDetails.html_url || url,
        owner: {
          id: repoDetails.owner?.id,
          login: repoDetails.owner?.login || owner,
          avatar_url: repoDetails.owner?.avatar_url,
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
          admin: repoDetails.permissions?.admin ?? false,
          push: repoDetails.permissions?.push ?? false,
          pull: repoDetails.permissions?.pull ?? false,
        },
        created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
        updated_at: repoDetails.updated_at || null,
      });
      await repoData.save();
      console.log(`${logPrefix} Created new RepoData`);
    }

    console.log(`${logPrefix} Repository processed: ${updatedRepo.full_name}`);

    await syncQueue.add({
      user_id: repo.user_id,
      repoData,
      logPrefix,
    });
  } catch (err) {
    console.error(`${logPrefix} Error: ${err.message}`);
    console.error(`${logPrefix} error stack: ${err.stack}`);
    await Repo.findOneAndUpdate({ request_id }, { status: 'Failed' });
  }
});

// const processRepoUpdate = async (job) => {
//   const { repoId, url, token, owner, repo, logPrefix } = job.data;
//   try {
//     const repoCheck = await Repo.findById(repoId);
//     if (!repoCheck || repoCheck.status !== 'Pending') {
//       console.log(`${logPrefix} Repository ${owner}/${repo} is no longer in Pending state. Skipping API call.`);
//       return;
//     }

//     console.log(`${logPrefix} Calling /retrieve for ${owner}/${repo}`);
//     const retrieveResponse = await axios.post(
//       `${process.env.GHTORRENT_API_URL}/retrieve`,
//       { url, token },
//       { timeout: 600000, headers: { 'Content-Type': 'application/json' } }
//     );

//     console.log(`${logPrefix} /retrieve response:`, retrieveResponse.data);

//     if (retrieveResponse.status !== 200) {
//       throw new Error(`Failed to retrieve repository from GitHub: ${retrieveResponse.statusText}`);
//     }

//     const retrieveData = retrieveResponse.data;
//     if (retrieveData.status !== 'success') {
//       throw new Error(retrieveData.message || 'Retrieve API failed');
//     }

//     console.log(`${logPrefix} Calling /repos/${owner}/${repo}`);
//     const repoResponse = await axios.get(
//       `${process.env.GHTORRENT_API_URL}/repos/${owner}/${repo}`,
//       { timeout: 600000 }
//     );

//     console.log(`${logPrefix} /repos response:`, repoResponse.data);

//     if (repoResponse.status !== 200) {
//       throw new Error(`Failed to fetch repository details from ghtorrent: ${repoResponse.statusText}`);
//     }

//     const repoDetails = repoResponse.data;

//     if (!repoDetails.id) {
//       throw new Error('Repository ID not found in response');
//     }

//     const encryptedToken = encryptToken(token);

//     try {
//       const updatedRepo = await Repo.findOneAndUpdate(
//         { _id: repoId },
//         {
//           full_name: repoDetails.full_name || `${owner}/${repo}`,
//           name: repoDetails.name,
//           token: encryptedToken,
//           status: 'Success',
//           html_url: repoDetails.html_url || url,
//         },
//         { new: true }
//       );
//       console.log("Repository updated:", updatedRepo);
//     } catch (error) {
//       throw new Error('Failed to update repository in database ' + error.message);
//     }

//     let repoData = await RepoData.findOne({ repo_id: repoId });

//     if (repoData) {
//       repoData = await RepoData.findOneAndUpdate(
//         { repo_id: repoId },
//         {
//           github_repo_id: repoDetails.id,
//           full_name: repoDetails.full_name || `${owner}/${repo}`,
//           name: repoDetails.name,
//           html_url: repoDetails.html_url || url,
//           owner: {
//             id: repoDetails.owner.id,
//             login: repoDetails.owner.login,
//             avatar_url: repoDetails.owner.avatar_url,
//           },
//           private: repoDetails.private,
//           homepage: repoDetails.homepage,
//           pushed_at: repoDetails.pushed_at ? new Date(repoDetails.pushed_at) : null,
//           default_branch: repoDetails.default_branch,
//           language: repoDetails.language,
//           stargazers_count: repoDetails.stargazers_count,
//           forks_count: repoDetails.forks_count,
//           watchers_count: repoDetails.watchers_count,
//           open_issues_count: repoDetails.open_issues_count,
//           permissions: {
//             admin: repoDetails.permissions ? repoDetails.permissions.admin : false,
//             push: repoDetails.permissions ? repoDetails.permissions.push : false,
//             pull: repoDetails.permissions ? repoDetails.permissions.pull : false,
//           },
//           created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
//           updated_at: repoDetails.updated_at ? new Date(repoDetails.updated_at) : null,
//         },
//         { new: true }
//       );
//       console.log(`${logPrefix} Updated existing RepoData for repo ${repoId}`);
//     } else {
//       // Nếu chưa tồn tại, tạo mới RepoData
//       repoData = new RepoData({
//         repo_id: repoId,
//         github_repo_id: repoDetails.id,
//         full_name: repoDetails.full_name || `${owner}/${repo}`,
//         name: repoDetails.name,
//         html_url: repoDetails.html_url || url,
//         owner: {
//           id: repoDetails.owner.id,
//           login: repoDetails.owner.login,
//           avatar_url: repoDetails.owner.avatar_url,
//         },
//         private: repoDetails.private,
//         homepage: repoDetails.homepage,
//         pushed_at: repoDetails.pushed_at ? new Date(repoDetails.pushed_at) : null,
//         default_branch: repoDetails.default_branch,
//         language: repoDetails.language,
//         stargazers_count: repoDetails.stargazers_count,
//         forks_count: repoDetails.forks_count,
//         watchers_count: repoDetails.watchers_count,
//         open_issues_count: repoDetails.open_issues_count,
//         permissions: {
//           admin: repoDetails.permissions ? repoDetails.permissions.admin : false,
//           push: repoDetails.permissions ? repoDetails.permissions.push : false,
//           pull: repoDetails.permissions ? repoDetails.permissions.pull : false,
//         },
//         created_at: repoDetails.created_at ? new Date(repoDetails.created_at) : null,
//         updated_at: repoDetails.updated_at ? new Date(repoDetails.updated_at) : null,
//       });
//       await repoData.save();
//       console.log(`${logPrefix} Created new RepoData for repo ${repoId}`);
//     }

//     console.log(`${logPrefix} Repository processed successfully: ${repoCheck.full_name}`);

//     await syncQueue.add({
//       user_id: repoCheck.user_id,
//       repoData,
//       logPrefix,
//     });
//   } catch (error) {
//     console.error(`${logPrefix} Error in retrieveQueue: ${error.message}`);
//     if (error.response) {
//       console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
//       console.error(`${logPrefix} Response status: ${error.response.status}`);
//     }
//     if (error.request) {
//       console.error(`${logPrefix} No response received from server`);
//     }
//     console.error(`${logPrefix} Error stack: ${error.stack}`);

//     await Repo.findByIdAndUpdate(repoId, { status: 'Failed' });
//   }
// };

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

retrieveQueue.process(processRepoUpdate);
syncQueue.process(processSyncQueue);

module.exports = { retrieveQueue, syncQueue };