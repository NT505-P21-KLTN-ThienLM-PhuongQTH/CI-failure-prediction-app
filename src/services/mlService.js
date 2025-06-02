const axios = require('axios');

const updateMLDataset = async (model_name, ci_builds) => {
  const logPrefix = '[updateMLDataset]';
  try {
    const response = await axios.post(`${process.env.ML_MODEL_API_URL}/dataset/append`, {
      retrain: true,
      model_name,
      ci_builds,
    });
    console.log(`${logPrefix} Dataset updated successfully: ${response.data}`);
    return response.data;
  } catch (error) {
    console.error(`${logPrefix} Error updating dataset: ${error.message}`);
    throw error;
  }
};

module.exports = { updateMLDataset };