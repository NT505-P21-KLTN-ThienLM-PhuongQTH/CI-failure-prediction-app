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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f9fafb;">

          <!-- Logo -->
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://ciflow-public.s3.us-east-1.amazonaws.com/logo-primary.png" alt="CI Flow Logo" style="max-width: 150px;">
          </div>

          <h2 style="color: #1f2937; text-align: center;">🔍 Prediction Mismatch Report</h2>

          <table style="width: 100%; margin-top: 20px;">
            <tr>
              <td style="font-weight: bold; color: #374151;">Run ID:</td>
              <td style="color: #1f2937;">${github_run_id}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #374151;">Project:</td>
              <td style="color: #1f2937;">${project_name}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #374151;">Branch:</td>
              <td style="color: #1f2937;">${branch}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #374151;">Predicted Result:</td>
              <td style="color: ${predicted_result ? '#dc2626' : '#16a34a'}; font-weight: 600;">
                ${predicted_result ? 'Failure' : 'Success'}
              </td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #374151;">Actual Result:</td>
              <td style="color: ${actual_result ? '#dc2626' : '#16a34a'}; font-weight: 600;">
                ${actual_result ? 'Failure' : 'Success'}
              </td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #374151;">Reported By:</td>
              <td style="color: #1f2937;">${reported_by}</td>
            </tr>
          </table>

          <div style="margin-top: 30px; text-align: center;">
            <a href="https://github.com/${project_name}/actions/runs/${github_run_id}" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">
              🔗 View Run on GitHub
            </a>
            <a href="${process.env.FRONTEND_URL}/reports" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px;">
              📊 View All Reports
            </a>
          </div>

        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`${logPrefix} Email sent for github_run_id=${github_run_id}`);
  } catch (error) {
    console.error(`${logPrefix} Error sending email for github_run_id=${github_run_id}: ${error.message}`);
    throw error;
  }
};

module.exports = { sendPredictionMismatchEmail };