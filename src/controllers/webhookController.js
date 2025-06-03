const crypto = require("crypto");
const axios = require("axios");
const { retrieveQueue, syncQueue } = require("../utils/queue");
const Repo = require("../models/Repo");
const RepoData = require("../models/RepoData");
const Webhook = require("../models/Webhook");

// Hàm mã hóa webhook_secret
const encryptWebhookSecret = (secret) => {
  const secretKey = process.env.ENCRYPTION_SECRET;
  const key = crypto.createHash("sha256").update(secretKey).digest();
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

// Hàm giải mã webhook_secret
const decryptWebhookSecret = (encryptedSecret) => {
  const secretKey = process.env.ENCRYPTION_SECRET;
  const key = crypto.createHash("sha256").update(secretKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedSecret, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

exports.verifyWebhook = async (req, res, next) => {
  const logPrefix = "[Webhook]";
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    console.log(`${logPrefix} No signature provided`);
    return res.status(401).json({ error: "No signature provided" });
  }

  const payload = req.body;
  console.log(`${logPrefix} Payload received:`, payload);

  const repoId = payload.workflow_run?.head_repository?.id || payload.repository?.id;
  if (!repoId) {
    console.log(`${logPrefix} Missing repository ID in payload`);
    return res.status(400).json({ error: "Missing repository ID in payload" });
  }

  const repoDatas = await RepoData.find({ github_repo_id: repoId });
  if (!repoDatas || repoDatas.length === 0) {
    console.log(`${logPrefix} Repository not found for github_repo_id=${repoId}`);
    return res.status(404).json({ 
      error: "Repository not found",
      details: `No repo found with github_repo_id ${repoId}`
    });
  }

  const repoIds = repoDatas.map(repoData => repoData.repo_id);
  const repos = await Repo.find({ _id: { $in: repoIds } });
  if (!repos || repos.length === 0) {
    console.log(`${logPrefix} Repo not found for github_repo_id=${repoId}`);
    return res.status(404).json({
      error: "Repository not found",
      details: `No Repo found for github_repo_id ${repoId}`,
    });
  }

  const webhooks = await Webhook.find({ repo_id: { $in: repoIds } });
  if (!webhooks || webhooks.length === 0) {
    console.log(`${logPrefix} Webhook not configured for github_repo_id=${repoId}`);
    return res.status(401).json({ 
      error: "Webhook not configured for this repository",
      details: `No webhook found for github_repo_id ${repoId}`
    });
  }

  let matchedWebhook = null;
  let matchedRepo = null;
  let matchedRepoData = null;
  for (const webhook of webhooks) {
    if (!webhook.active) {
      console.log(`${logPrefix} Webhook inactive for repo_id=${webhook.repo_id}, active=${webhook.active}`);
      continue;
    }

    if (webhook.status !== "Configured") {
      console.log(`${logPrefix} Webhook configuration failed for repo_id=${webhook.repo_id}, status=${webhook.status}`);
      continue;
    }

    const secret = decryptWebhookSecret(webhook.webhook_secret);
    const digest = `sha256=${crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")}`;

    if (crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
      matchedWebhook = webhook;
      matchedRepo = repos.find(repo => repo._id.toString() === webhook.repo_id.toString());
      matchedRepoData = repoDatas.find((repoData) => repoData.repo_id.toString() === webhook.repo_id.toString());
      break;
    }
  }

  if (!matchedWebhook || !matchedRepo || !matchedRepoData) {
    console.log(`${logPrefix} No matching webhook found for github_repo_id=${repoId}`);
    return res.status(401).json({ 
      error: "Invalid signature or no matching webhook",
      details: `No webhook matched for github_repo_id ${repoId}`
    });
  }

  req.repo = matchedRepo;
  req.repoData = matchedRepoData;
  req.webhook = matchedWebhook;
  next();
};

exports.handleWebhook = async (req, res) => {
  const logPrefix = "[Webhook]";
  try {
    const payload = req.body;
    console.log(`${logPrefix} Received webhook payload:`, payload);

    const action = payload.action;
    if (action !== "completed") {
      console.log(`${logPrefix} Action "${action}" not processed (only "completed" is processed)`);
      return res.status(200).json({ message: `Action "${action}" not processed`, details: "Only 'completed' action is processed" });
    }

    const repo = req.repo;
    const repoData = req.repoData;

    const repoId = repo._id;
    const user_id = repo.user_id;
    const url = repoData.html_url;
    const token = repo.decryptToken();
    const owner = repoData.owner.login;
    const repoName = repoData.name;

    await Repo.findOneAndUpdate(
      { _id: repoId },
      { status: "Pending" },
      { new: true }
    );
    console.log(`${logPrefix} Repository ${repoData.full_name} set to Pending state for processing`);

    await retrieveQueue.add({
      repoId: repoId,
      url,
      token,
      owner,
      repo: repoName,
      logPrefix,
    });

    res.status(200).json({ message: "Webhook queued for processing" });
  } catch (error) {
    console.error(`${logPrefix} Error processing webhook: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`${logPrefix} Response status: ${error.response.status}`);
    }

    if (req.repo) {
      await Repo.findOneAndUpdate(
        { _id: req.repo._id },
        { status: "Failed" },
        { new: true }
      ).then(() => console.log(`${logPrefix} Repository ${req.repoData.full_name} set to Failed state`));
    }

    res.status(500).json({ error: "Failed to process webhook", details: error.message });
  }
};

exports.checkWebhook = async (req, res, next) => {
  const logPrefix = "[checkWebhook]";
  try {
    const { repo_id } = req.query;

    if (!repo_id) {
      return res.status(400).json({ error: "Missing repo_id" });
    }

    const webhook = await Webhook.findOne({ repo_id });
    if (!webhook) {
      return res.status(200).json({ exists: false, active: false });
    }

    res.status(200).json({ exists: true, active: webhook.active });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.listWebhooks = async (req, res, next) => {
  const logPrefix = "[listWebhooks]";
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    const repos = await Repo.find({ user_id }).select("_id user_id");
    const repoIds = repos.map((r) => r._id);

    const repoDatas = await RepoData.find({ repo_id: { $in: repoIds } }).select("repo_id github_repo_id full_name owner name");

    const webhooks = await Webhook.find({ repo_id: { $in: repoIds } }).select(
      "repo_id active webhook_secret webhook_url events github_webhook_id status"
    );

    const webhookList = webhooks.map((w) => {
      const repoData = repoDatas.find((rd) => rd.repo_id.toString() === w.repo_id.toString());
      return {
        repo_id: w.repo_id,
        full_name: repoData ? repoData.full_name : "Unknown Repository",
        owner: repoData ? repoData.owner.login : "Unknown",
        name: repoData ? repoData.name : "Unknown",
        active: w.active,
        webhook_secret: decryptWebhookSecret(w.webhook_secret),
        webhook_url: w.webhook_url,
        events: w.events,
        github_webhook_id: w.github_webhook_id,
        status: w.status,
      };
    });

    res.status(200).json(webhookList);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.configureWebhook = async (req, res, next) => {
  const logPrefix = "[configureWebhook]";
  try {
    const { repo_id, webhook_secret, active } = req.body;

    if (!repo_id) {
      return res.status(400).json({ error: "Missing repo_id" });
    }

    const repo = await Repo.findById(repo_id);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const repoData = await RepoData.findOne({ repo_id });
    if (!repoData) {
      return res.status(404).json({ error: "RepoData not found" });
    }

    const owner = repoData.owner.login;
    const name = repoData.name;
    const user_id = repo.user_id;

    let webhook = await Webhook.findOne({ repo_id });

    if (active) {
      if (!webhook_secret) {
        return res.status(400).json({ error: "Webhook secret is required when enabling webhook" });
      }

      const encryptedSecret = encryptWebhookSecret(webhook_secret);

      if (webhook) {
        webhook = await Webhook.findOneAndUpdate(
          { repo_id },
          { webhook_secret: encryptedSecret, active: true, status: "Pending", user_id },
          { new: true }
        );
      } else {
        webhook = new Webhook({
          repo_id,
          user_id,
          webhook_secret: encryptedSecret,
          webhook_url: process.env.WEBHOOK_URL || "http://localhost:5000/api/webhook",
          events: ["push", "workflow_run"],
          active: true,
          status: "Pending",
        });
        await webhook.save();
      }

      const decryptedToken = repo.decryptToken();
      console.log(`${logPrefix} Using token: ${decryptedToken.substring(0, 5)}...`);

      const response = await axios.post(
        `https://api.github.com/repos/${owner}/${name}/hooks`,
        {
          name: "web",
          active: true,
          events: ["push", "workflow_run"],
          config: {
            url: process.env.WEBHOOK_URL || "http://localhost:5000/api/webhook",
            content_type: "json",
            secret: webhook_secret,
          },
        },
        {
          headers: {
            Authorization: `token ${decryptedToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (response.data && response.data.id) {
        await Webhook.findOneAndUpdate(
          { repo_id },
          { github_webhook_id: response.data.id, status: "Configured", user_id },
          { new: true }
        );
      } else {
        throw new Error("Failed to create webhook on GitHub");
      }
    } else {
      if (webhook) {
        await Webhook.findOneAndUpdate({ repo_id }, { active: false, status: "Failed" });
        const decryptedToken = repo.decryptToken();
        if (webhook.github_webhook_id) {
          await axios.delete(
            `https://api.github.com/repos/${owner}/${name}/hooks/${webhook.github_webhook_id}`,
            {
              headers: {
                Authorization: `token ${decryptedToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
        }
      }
    }

    res.status(200).json({ message: "Webhook configured successfully" });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
      const errorData = error.response.data;
      if (error.response.status === 403) {
        return res.status(403).json({
          error: "GitHub API access denied. Check token permissions (repo, admin:repo_hook).",
          details: errorData,
        });
      } else if (error.response.status === 422) {
        await Webhook.findOneAndUpdate(
          { repo_id: req.body.repo_id },
          { status: "Failed" },
          { new: true }
        ).then(() => console.log(`${logPrefix} Updated status to Failed for repo_id: ${req.body.repo_id}`));
        return res.status(422).json({
          error: "Validation failed. Ensure webhook URL is publicly accessible (not localhost).",
          details: errorData,
          suggestion: "Use a public URL (e.g., ngrok) for development.",
        });
      }
    }

    const existingWebhook = await Webhook.findOne({ repo_id: req.body.repo_id });
    if (existingWebhook) {
      await Webhook.findOneAndUpdate(
        { repo_id: req.body.repo_id },
        { status: "Failed" },
        { new: true }
      ).then(() => console.log(`${logPrefix} Updated status to Failed for repo_id: ${req.body.repo_id}`));
    } else {
      console.warn(`${logPrefix} No webhook found to update status for repo_id: ${req.body.repo_id}`);
    }

    return res.status(500).json({
      error: "Internal server error while configuring webhook",
      details: error.message,
    });
  }
};

exports.updateWebhook = async (req, res, next) => {
  const logPrefix = "[updateWebhook]";
  try {
    const { repo_id, webhook_secret, active } = req.body;

    if (!repo_id) {
      return res.status(400).json({ error: "Missing repo_id" });
    }

    const repo = await Repo.findById(repo_id);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const repoData = await RepoData.findOne({ repo_id });
    if (!repoData) {
      return res.status(404).json({ error: "RepoData not found" });
    }

    const webhook = await Webhook.findOne({ repo_id });
    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const updates = {};
    if (webhook_secret !== undefined) {
      updates.webhook_secret = encryptWebhookSecret(webhook_secret);
    }
    if (active !== undefined) {
      updates.active = active;
      if (!active && webhook.github_webhook_id) {
        const decryptedToken = repo.decryptToken();
        const owner = repoData.owner.login;
        const name = repoData.name;
        await axios.delete(
          `https://api.github.com/repos/${owner}/${name}/hooks/${webhook.github_webhook_id}`,
          {
            headers: {
              Authorization: `token ${decryptedToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await Webhook.findOneAndUpdate({ repo_id }, updates, { new: true });
    }

    res.status(200).json({ message: "Webhook updated successfully" });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.deleteWebhook = async (req, res, next) => {
  const logPrefix = "[deleteWebhook]";
  try {
    const { repo_id } = req.body;

    if (!repo_id) {
      return res.status(400).json({ error: "Missing repo_id" });
    }

    const repo = await Repo.findById(repo_id);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const repoData = await RepoData.findOne({ repo_id });
    if (!repoData) {
      return res.status(404).json({ error: "RepoData not found" });
    }

    const webhook = await Webhook.findOne({ repo_id });
    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    if (webhook.github_webhook_id) {
      const decryptedToken = repo.decryptToken();
      const owner = repoData.owner.login;
      const name = repoData.name;
      await axios.delete(
        `https://api.github.com/repos/${owner}/${name}/hooks/${webhook.github_webhook_id}`,
        {
          headers: {
            Authorization: `token ${decryptedToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
    }

    await Webhook.findOneAndDelete({ repo_id });

    res.status(200).json({ message: "Webhook deleted successfully" });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    next(error);
  }
};

exports.triggerSync = async (req, res, next) => {
  const logPrefix = "[triggerSync]";
  try {
    const { repo_id } = req.body;

    if (!repo_id) {
      console.log(`${logPrefix} Missing repo_id`);
      return res.status(400).json({ error: "Missing repo_id" });
    }

    const repo = await Repo.findById(repo_id);
    if (!repo) {
      console.log(`${logPrefix} Repository not found for repo_id=${repo_id}`);
      return res.status(404).json({ error: "Repository not found" });
    }

    const repoData = await RepoData.findOne({ repo_id });
    if (!repoData) {
      console.log(`${logPrefix} RepoData not found for repo_id=${repo_id}`);
      return res.status(404).json({ error: "RepoData not found" });
    }

    const url = repoData.html_url;
    const token = repo.decryptToken();
    const owner = repoData.owner.login;
    const repoName = repoData.name;

    await Repo.findOneAndUpdate(
      { _id: repo_id },
      { status: "Pending" },
      { new: true }
    );
    console.log(`${logPrefix} Repository ${repoData.full_name} set to Pending state for sync`);

    await retrieveQueue.add({
      repoId: repo_id,
      url,
      token,
      owner,
      repo: repoName,
      logPrefix,
    });

    console.log(`${logPrefix} Sync job added to queue for repo_id=${repo_id}`);
    res.status(200).json({ message: "Sync triggered successfully" });
  } catch (error) {
    console.error(`${logPrefix} Error triggering sync: ${error.message}`);
    if (req.body.repo_id) {
      await Repo.findOneAndUpdate(
        { _id: req.body.repo_id },
        { status: "Failed" },
        { new: true }
      ).then(() => console.log(`${logPrefix} Repository set to Failed state for repo_id=${req.body.repo_id}`));
    }
    res.status(500).json({ error: "Failed to trigger sync",
      details: error.message });
  }
};