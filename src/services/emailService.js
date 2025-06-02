const nodemailer = require('nodemailer');
const axios = require('axios');
const { email } = require('../config/email');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: email.user,
    pass: email.pass,
  },
});

const sendPredictionMismatchEmail = async ({ logPrefix, github_run_id, project_name, branch, predicted_result, actual_result, reported_by }) => {
  try {
    const mailOptions = {
      from: email.user,
      to: email.admin,
      subject: `Prediction Mismatch Report for Run ${github_run_id}`,
      html: `
        <h2>Prediction Mismatch Reported</h2>
        <p><strong>Run ID:</strong> ${github_run_id}</p>
        <p><strong>Project:</strong> ${project_name}</p>
        <p><strong>Branch:</strong> ${branch}</p>
        <p><strong>Predicted Result:</strong> ${predicted_result ? 'Failure' : 'Success'}</p>
        <p><strong>Actual Result:</strong> ${actual_result ? 'Failure' : 'Success'}</p>
        <p><strong>Reported By:</strong> ${reported_by}</p>
        <p><a href="https://github.com/${project_name}/actions/runs/${github_run_id}">View Run Details</a></p>
        <p><a href="${process.env.FRONTEND_URL}/reports">View All Reports</a></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`${logPrefix} Email sent for github_run_id=${github_run_id}`);
  } catch (error) {
    console.error(`${logPrefix} Error sending email for github_run_id=${github_run_id}: ${error.message}`);
    throw error;
  }
};

module.exports = { sendPredictionMismatchEmail };