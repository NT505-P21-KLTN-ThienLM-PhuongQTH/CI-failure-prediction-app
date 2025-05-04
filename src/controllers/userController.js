const User = require("../models/User");

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