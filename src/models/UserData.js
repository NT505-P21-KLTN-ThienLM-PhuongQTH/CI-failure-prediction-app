const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  country: { type: String, default: '' },
  cityState: { type: String, default: '' },
  postalCode: { type: String, default: '' },
});

const userDataSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  fullname: { type: String, default: '' },
  email: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  phone: { type: String, default: '' },
  pronouns: { type: String, default: '' },
  bio: { type: String, default: '' },
  github_account: { type: String, default: '' },
  address: { type: addressSchema, default: {} },
  avatar: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('UserData', userDataSchema);