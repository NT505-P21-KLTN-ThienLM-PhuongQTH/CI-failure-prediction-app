const mongoose = require("mongoose");

const WebhookSchema = new mongoose.Schema(
  {
    repo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      unique: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    github_webhook_id: {
      type: Number,
      required: false,
    },
    webhook_secret: {
      type: String,
      required: true,
    },
    webhook_url: {
      type: String,
      required: true,
      default: process.env.WEBHOOK_URL || "http://localhost:5000/api/webhook",
    },
    events: {
      type: [String],
      required: true,
      default: ["push", "workflow_run"],
    },
    active: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Pending", "Configured", "Failed"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Webhook", WebhookSchema);