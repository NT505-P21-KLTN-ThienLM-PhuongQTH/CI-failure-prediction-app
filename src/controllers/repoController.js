const axios = require('axios');
const Repo = require('../models/Repo');
const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const syncWorkflowsAndRuns = require('../utils/syncWorkflowsAndRuns');
const crypto = require('crypto');
const { retrieveQueue, syncQueue } = require('../utils/queue');

// Hàm mã hóa token
const encryptToken = (token) => {
  const secret = process.env.ENCRYPTION_SECRET;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = Buffer.alloc(16, 0);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

// Hàm trích xuất owner và repo từ URL
const extractOwnerRepo = (url) => {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  return { owner: match[1], repo: match[2] };
};

const processRepoUpdate = async (job) => {
  const { repoId, url, token, owner, repo, logPrefix } = job.data;
  try {
    const repoCheck = await Repo.findOne({ _id: repoId });
    if (!repoCheck || repoCheck.status !== 'Pending') {
      console.log(`${logPrefix} Repository ${owner}/${repo} is no longer in Pending state. Skipping API call.`);
      return;
    }

    console.log(`${logPrefix} Calling /retrieve for ${owner}/${repo}`);
    const retrieveResponse = await axios.post(
      'http://localhost:4567/retrieve',
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
      `http://localhost:4567/repos/${owner}/${repo}`,
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

    const updatedRepo = await Repo.findOneAndUpdate(
      { _id: repoId },
      {
        github_repo_id: repoDetails.id,
        full_name: repoDetails.full_name || `${owner}/${repo}`,
        owner: {
          id: repoDetails.owner.id,
          login: repoDetails.owner.login,
          avatar_url: repoDetails.owner.avatar_url,
        },
        name: repoDetails.name,
        token: encryptedToken,
        status: 'Success',
        private: repoDetails.private,
        html_url: repoDetails.html_url || url,
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
      },
      { new: true }
    );

    console.log(`${logPrefix} Repository processed successfully: ${updatedRepo.full_name}`);

    // Đẩy công việc đồng bộ workflows và runs vào syncQueue
    await syncQueue.add({
      user_id: repoCheck.user_id,
      repo: updatedRepo,
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

    await Repo.findOneAndUpdate({ _id: repoId }, { status: 'Failed' }, { new: true });
  }
};

// Worker xử lý retrieveQueue
retrieveQueue.process(processRepoUpdate);

// Worker xử lý syncQueue
syncQueue.process(async (job) => {
  const { user_id, repo, logPrefix } = job.data;
  try {
    console.log(`${logPrefix} Syncing workflows and runs for repository ${repo.full_name}`);
    await syncWorkflowsAndRuns(user_id, repo, logPrefix);
    console.log(`${logPrefix} Successfully synced workflows and runs for ${repo.full_name}`);
  } catch (error) {
    console.error(`${logPrefix} Error in syncQueue: ${error.message}`);
    console.error(`${logPrefix} Error stack: ${error.stack}`);
  }
});

exports.addRepo = async (req, res, next) => {
  const logPrefix = '[addRepo]';
  try {
    const { user_id, url, token } = req.body;

    if (!user_id || !url || !token) {
      console.warn(`${logPrefix} Missing required fields: user_id=${!!user_id}, url=${!!url}, token=${!!token}`);
      return res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS' });
    }

    const { owner, repo } = extractOwnerRepo(url);
    const full_name = `${owner}/${repo}`;

    const existingRepo = await Repo.findOne({ user_id, full_name, status: { $in: ['Pending', 'Success', 'Failed'] } });
    if (existingRepo) {
      console.log(`${logPrefix} Repository ${full_name} already exists with status ${existingRepo.status}`);
      return res.status(409).json({
        error: `Repository ${full_name} already exists with status ${existingRepo.status}.`,
        status: existingRepo.status,
      });
    }

    const pendingRepo = new Repo({
      user_id,
      github_repo_id: Date.now(),
      full_name,
      owner: {
        id: 0,
        login: owner,
        avatar_url: '',
      },
      name: repo,
      token,
      status: 'Pending',
      private: false,
      html_url: url,
      homepage: '',
      pushed_at: null,
      default_branch: '',
      language: '',
      stargazers_count: 0,
      forks_count: 0,
      watchers_count: 0,
      open_issues_count: 0,
      permissions: {
        admin: false,
        push: false,
        pull: false,
      },
    });

    await pendingRepo.save();

    res.status(201).json({
      id: pendingRepo._id.toString(),
      full_name: pendingRepo.full_name,
      name: pendingRepo.name,
      html_url: pendingRepo.html_url,
      status: pendingRepo.status,
    });

    await retrieveQueue.add({
      repoId: pendingRepo._id,
      url,
      token,
      owner,
      repo,
      logPrefix,
    });

    // setTimeout(async () => {
    //   try {
    //     const repoCheck = await Repo.findOne({ _id: pendingRepo._id });
    //     if (!repoCheck || repoCheck.status !== 'Pending') {
    //       console.log(`${logPrefix} Repository ${full_name} is no longer in Pending state. Skipping API call.`);
    //       return;
    //     }

    //     const decryptedToken = repoCheck.decryptToken();

    //     console.log(`${logPrefix} Calling /retrieve for ${owner}/${repo}`);
    //     const retrieveResponse = await axios.post(
    //       'http://localhost:4567/retrieve',
    //       { url, token: decryptedToken },
    //       {
    //         timeout: 600000,
    //         headers: {
    //           'Content-Type': 'application/json',
    //         },
    //       }
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
    //       `http://localhost:4567/repos/${owner}/${repo}`,
    //       { timeout: 600000 }
    //     );

    //     console.log(`${logPrefix} /repos response:`, repoResponse.data);

    //     if (repoResponse.status !== 200) {
    //       throw new Error(`Failed to fetch repository details from ghtorrent: ${repoResponse.statusText}`);
    //     }

    //     const repoData = repoResponse.data;
    //     const repoDetails = repoData;

    //     if (!repoDetails.id) {
    //       throw new Error('Repository ID not found in response');
    //     }

    //     const encryptedToken = encryptToken(token);

    //     const updatedRepo = await Repo.findOneAndUpdate(
    //       { _id: pendingRepo._id },
    //       {
    //         github_repo_id: repoDetails.id,
    //         full_name: repoDetails.full_name || `${owner}/${repo}`,
    //         owner: {
    //           id: repoDetails.owner.id,
    //           login: repoDetails.owner.login,
    //           avatar_url: repoDetails.owner.avatar_url,
    //         },
    //         name: repoDetails.name,
    //         token: encryptedToken,
    //         status: 'Success',
    //         private: repoDetails.private,
    //         html_url: repoDetails.html_url || url,
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
    //       },
    //       { new: true }
    //     );

    //     console.log(`${logPrefix} Repository added successfully: ${repoDetails.id}`);

    //     // Đồng bộ workflows và runs ngay sau khi trạng thái là Success
    //     await syncWorkflowsAndRuns(user_id, updatedRepo, logPrefix);
    //   } catch (error) {
    //     console.error(`${logPrefix} Error: ${error.message}`);
    //     if (error.response) {
    //       console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    //       console.error(`${logPrefix} Response status: ${error.response.status}`);
    //     }
    //     if (error.request) {
    //       console.error(`${logPrefix} No response received from server`);
    //     }
    //     console.error(`${logPrefix} Error stack: ${error.stack}`);

    //     await Repo.findOneAndUpdate(
    //       { _id: pendingRepo._id },
    //       { status: 'Failed' },
    //       { new: true }
    //     );
    //   }
    // }, 0);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.getUserRepos = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const repos = await Repo.find({ user_id }).lean();
    res.status(200).json(repos.map(repo => ({
      id: repo._id.toString(),
      full_name: repo.full_name,
      name: repo.name,
      html_url: repo.html_url,
      status: repo.status,
    })));
  } catch (error) {
    next(error);
  }
};

exports.updateRepo = async (req, res, next) => {
  const logPrefix = '[updateRepo]';
  try {
    const repoId = req.params.id;
    const { url, token } = req.body;

    if (!url || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { owner, repo } = extractOwnerRepo(url);

    const pendingRepo = await Repo.findOneAndUpdate(
      { _id: repoId, },
      { status: 'Pending' },
      { new: true }
    );

    if (!pendingRepo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    res.status(200).json({
      id: pendingRepo._id.toString(),
      full_name: pendingRepo.full_name,
      name: pendingRepo.name,
      html_url: pendingRepo.html_url,
      status: pendingRepo.status,
    });

    await retrieveQueue.add({
      repoId: pendingRepo._id,
      url,
      token,
      owner,
      repo,
      logPrefix,
    });

    // setTimeout(async () => {
    //   try {
    //     console.log(`${logPrefix} Calling /repos/${owner}/${repo}`);
    //     const repoResponse = await axios.get(
    //       `http://localhost:4567/repos/${owner}/${repo}`,
    //       { timeout: 600000 }
    //     );

    //     console.log(`${logPrefix} /repos response:`, repoResponse.data);

    //     if (repoResponse.status !== 200) {
    //       throw new Error(`Failed to fetch repository details from ghtorrent: ${repoResponse.statusText}`);
    //     }

    //     const repoData = repoResponse.data;
    //     const repoDetails = repoData;

    //     const encryptedToken = encryptToken(token);

    //     const updatedRepo = await Repo.findOneAndUpdate(
    //       { _id: repoId },
    //       {
    //         full_name: repoDetails.full_name || `${owner}/${repo}`,
    //         owner: {
    //           id: repoDetails.owner.id,
    //           login: repoDetails.owner.login,
    //           avatar_url: repoDetails.owner.avatar_url,
    //         },
    //         name: repoDetails.name,
    //         token: encryptedToken,
    //         status: 'Success',
    //         private: repoDetails.private,
    //         html_url: repoDetails.html_url || url,
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
    //       },
    //       { new: true }
    //     );

    //     if (!updatedRepo) {
    //       throw new Error('Repository not found');
    //     }

    //     console.log(`${logPrefix} Repository updated successfully: ${repoDetails.id}`);

    //     // Đồng bộ workflows và runs sau khi cập nhật thành công
    //     await syncWorkflowsAndRuns(pendingRepo.user_id, updatedRepo, logPrefix);
    //   } catch (error) {
    //     console.error(`${logPrefix} Error: ${error.message}`);
    //     if (error.response) {
    //       console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    //       console.error(`${logPrefix} Response status: ${error.response.status}`);
    //     }
    //     if (error.request) {
    //       console.error(`${logPrefix} No response received from server`);
    //     }
    //     console.error(`${logPrefix} Error stack: ${error.stack}`);

    //     await Repo.findOneAndUpdate(
    //       { github_repo_id: repoId },
    //       { status: 'Failed' },
    //       { new: true }
    //     );
    //   }
    // }, 0);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.deleteRepo = async (req, res, next) => {
  const logPrefix = '[deleteRepo]';
  try {
    const repoId = req.params.id;
    const deletedRepo = await Repo.findOneAndDelete({ _id: repoId });

    if (!deletedRepo) {
      console.log(`${logPrefix} Repository not found: ${repoId}`);
      return res.status(404).json({ error: 'Repository not found' });
    }

    console.log(`${logPrefix} Repository deleted successfully: ${deletedRepo.full_name}`);

    const deletedWorkflows = await Workflow.deleteMany({ repo_id: repoId });
    console.log(`${logPrefix} Deleted ${deletedWorkflows.deletedCount} workflows for repository ${repoId}`);

    const deletedWorkflowsRuns = await WorkflowRun.deleteMany({ repo_id: repoId });
    console.log(`${logPrefix} Deleted ${deletedWorkflowsRuns.deletedCount} workflow runs for repository ${repoId}`);

    res.status(200).json({ 
      message: 'Repository deleted successfully',
      deletedRepo: deletedRepo.full_name,
      deletedWorkflows: deletedWorkflows.deletedCount,
      deletedWorkflowsRuns: deletedWorkflowsRuns.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

