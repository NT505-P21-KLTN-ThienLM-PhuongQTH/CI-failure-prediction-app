const mongoose = require('mongoose');

const RepoDataSchema = new mongoose.Schema({
    repo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Repo', required: true }, // Tham chiếu tới Repo
    github_repo_id: { type: Number, required: true }, // ID từ GitHub
    full_name: { type: String, required: true },
    name: { type: String, required: true },
    html_url: { type: String },
    owner: {
        type: {
        id: { type: Number, required: true },
        login: { type: String, required: true },
        avatar_url: { type: String, required: false },
        _id: false,
        },
        required: true,
    },
    private: { type: Boolean },
    homepage: { type: String },
    pushed_at: { type: Date },
    default_branch: { type: String },
    language: { type: String },
    stargazers_count: { type: Number },
    forks_count: { type: Number },
    watchers_count: { type: Number },
    open_issues_count: { type: Number },
    permissions: {
        type: {
        admin: { type: Boolean, required: true },
        push: { type: Boolean, required: true },
        pull: { type: Boolean, required: true },
        _id: false,
        },
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('RepoData', RepoDataSchema);