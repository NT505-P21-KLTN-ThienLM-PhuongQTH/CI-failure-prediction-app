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

module.exports = { encryptToken, extractOwnerRepo, checkRepoExists };