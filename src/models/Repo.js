const mongoose = require('mongoose');
const crypto = require('crypto');

const RepoSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Tham chiếu đến User
  full_name: { type: String, required: true },
  name: { type: String, required: true },
  html_url: { type: String },
  status: { type: String, enum: ['Queued', 'Pending', 'Success', 'Failed'], default: 'Queued' },
  token: { type: String, required: true }, // Token mã hóa
  request_id: { type: String, required: false }, // ID của request
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

module.exports = mongoose.model('Repo', RepoSchema);