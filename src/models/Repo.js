const mongoose = require('mongoose');
const crypto = require('crypto');

const RepoSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Tham chiếu đến User
  github_repo_id: { type: Number, required: true }, // ID từ GitHub
  full_name: { type: String, required: true },
  owner: {
    type: {
      id: { type: Number, required: true },
      login: { type: String, required: true },
      avatar_url: { type: String, required: false },
      _id: false,
    },
    required: true,
  },
  name: { type: String, required: true },
  token: { type: String, required: true }, // Token mã hóa
  status: { type: String, enum: ['Pending', 'Success', 'Failed'], default: 'Pending' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  private: { type: Boolean },
  html_url: { type: String },
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
  webhook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Webhook",
    required: false,
  },
}, { timestamps: true });

// Mã hóa token trước khi lưu
RepoSchema.pre('save', function(next) {
  if (this.isModified('token')) {
    const secret = process.env.ENCRYPTION_SECRET;
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.alloc(16, 0); // Khởi tạo iv toàn số 0

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(this.token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    this.token = encrypted;
  }
  next();
});

// Phương thức giải mã token
RepoSchema.methods.decryptToken = function() {
  const secret = process.env.ENCRYPTION_SECRET;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = Buffer.alloc(16, 0);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(this.token, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Tạo index cho user_id và github_repo_id để truy vấn nhanh hơn
// RepoSchema.index({ user_id: 1, github_repo_id: 1 });

module.exports = mongoose.model('Repo', RepoSchema);