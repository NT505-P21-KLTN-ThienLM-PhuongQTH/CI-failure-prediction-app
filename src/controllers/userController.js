const User = require("../models/User");
const bcrypt = require("bcrypt");
const UserData = require("../models/UserData");

exports.createUser = async (req, res, next) => {
  const logPrefix = "[createUser]";
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      console.log('Missing fields:', { name, email, password, role });
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
    });
    await newUser.save();

    const userData = new UserData({
      user_id: newUser._id,
      fullname: name,
      email: email,
      role: role,
      phone: '',
      pronouns: '',
      bio: '',
      github_account: '',
      address: {},
      avatar: '',
    });
    await userData.save();

    console.log(`${logPrefix} User and UserData created successfully: ${newUser._id}`);
    res.status(201).json({
      user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role },
      message: "User created successfully"
    });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  const logPrefix = "[updateUser]";
  try {
    const { user_id } = req.params;
    const { email } = req.body;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user_id },
      { email },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log(`${logPrefix} User updated successfully for user ${user_id}`);
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};