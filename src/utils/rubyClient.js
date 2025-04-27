const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// Cấu hình retry cho axios
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 2000,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response && error.response.status >= 500);
  },
});

const callRubyAPI = async (endpoint, method, data = null) => {
  const logPrefix = '[callRubyAPI]';
  try {
    const url = `http://localhost:4567${endpoint}`;
    console.log(`${logPrefix} Calling Ruby API: ${method} ${url}`);

    const config = {
      method: method.toLowerCase(),
      url,
      timeout: 10000, // Timeout 10 giây
    };

    if (method.toUpperCase() === 'POST' && data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }

    const response = await axios(config);

    if (response.status !== 200) {
      throw new Error(`Ruby API ${endpoint} failed with status ${response.status}: ${response.statusText}`);
    }

    console.log(`${logPrefix} Successfully called Ruby API: ${method} ${url}`);
    return response.data;
  } catch (error) {
    console.error(`${logPrefix} Error calling Ruby API ${endpoint}: ${error.message}`);
    if (error.response) {
      console.error(`${logPrefix} Response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};

module.exports = { callRubyAPI };