const crypto = require('crypto');
const axios = require('axios');

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

const checkRepoExists = async (owner, repo, token) => {
    try {
        const response = await axios.head(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

    return response.status === 200;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return false;
        } else {
            console.error('Error while checking repo:', error.message);
            throw error;
        }
    }
};

const extractBranchFromHtmlUrl = (htmlUrl) => {
  try {
    const urlParts = htmlUrl.split("/blob/");
    if (urlParts.length < 2) {
      throw new Error("Invalid html_url format");
    }
    const branchAndPath = urlParts[1].split("/");
    const branch = branchAndPath[0];
    return branch;
  } catch (error) {
    console.error("[extractBranchFromHtmlUrl] Error:", error.message);
    throw new Error("Failed to extract branch from html_url");
  }
};

module.exports = { encryptToken, extractOwnerRepo, checkRepoExists, extractBranchFromHtmlUrl};