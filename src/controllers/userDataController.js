const User = require("../models/User");
const UserData = require("../models/UserData");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
});

const upload = multer({ storage: multer.memoryStorage() });

exports.createUserData = async (req, res, next) => {
  const logPrefix = "[createUserData]";
  try {
    const { user_id, fullname, email, role, phone, pronouns, bio, github_account, address, avatar } = req.body;

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = await UserData.findOneAndUpdate(
      { user_id },
      {
        fullname: fullname || user.name,
        email: email || user.email,
        role: role || user.role,
        phone: phone || "",
        pronouns: pronouns || "",
        bio: bio || "",
        github_account: github_account || "",
        address: address || {},
        avatar: avatar || "",
        updatedAt: Date.now(),
      },
      { new: true, upsert: true }
    );

    console.log(`${logPrefix} UserData created/updated successfully for user ${user_id}`);
    res.status(201).json(userData);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.getUserData = async (req, res, next) => {
  const logPrefix = "[getUserData]";
  try {
    const { user_id } = req.params;
    const userData = await UserData.findOne({ user_id }).lean();
    if (!userData) {
      return res.status(404).json({ error: "User data not found" });
    }
    console.log(`${logPrefix} User data retrieved for user ${user_id}`);
    res.status(200).json(userData);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.getAllUserData = async (req, res, next) => {
  const logPrefix = "[getAllUserData]";
  try {
    const userData = await UserData.find().lean();
    console.log(`${logPrefix} All user data retrieved by admin ${req.user.id}`);
    res.status(200).json(userData);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.updateUserData = async (req, res, next) => {
  const logPrefix = "[updateUserData]";
  try {
    const { user_id } = req.params;
    const updateData = req.body;

    const user = await User.findById(user_id);
    if (!user) {
      console.log(`${logPrefix} User not found for user_id: ${user_id}`);
      return res.status(404).json({ error: "User not found" });
    }

    let userData = await UserData.findOne({ user_id });

    if (userData) {
      userData = await UserData.findOneAndUpdate(
        { user_id },
        { ...updateData, updatedAt: Date.now() },
        { new: true, runValidators: true }
      );
      console.log(`${logPrefix} UserData updated for user_id: ${user_id}`);
    } else {
      userData = await UserData.create({
        user_id,
        ...updateData,
      });
      console.log(`${logPrefix} UserData created for user_id: ${user_id}`);
    }

    const userUpdate = {};
    if (updateData.fullname) userUpdate.name = updateData.fullname;
    if (updateData.email) userUpdate.email = updateData.email;

    if (Object.keys(userUpdate).length > 0) {
      await User.findByIdAndUpdate(
        user_id,
        { ...userUpdate, updatedAt: Date.now() },
        { new: true, runValidators: true }
      );
      console.log(`${logPrefix} User updated with name/email for user_id: ${user_id}`);
    }

    res.status(200).json(userData);
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.deleteUserData = async (req, res, next) => {
  const logPrefix = "[deleteUserData]";
  try {
    const { user_id } = req.params;

    // Delete user data
    const userData = await UserData.findOneAndDelete({ user_id });

    if (!userData) {
      return res.status(404).json({ error: "User data not found" });
    }

    // Delete user model as well
    const user = await User.findByIdAndDelete(user_id);

    if (!user) {
      console.log(`${logPrefix} User data deleted, but user not found for user_id: ${user_id}`);
      return res.status(200).json({ message: "User data deleted, but user not found" });
    }

    console.log(`${logPrefix} User data and user deleted successfully for user ${user_id}`);
    res.status(200).json({ message: "User data and user deleted successfully" });
  } catch (error) {
    console.error(`${logPrefix} Error: ${error.message}`);
    next(error);
  }
};

exports.uploadAvatar = [
  upload.single("avatar"),
  async (req, res, next) => {
    const logPrefix = "[uploadAvatar]";
    try {
      const { user_id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `${user_id}/${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      const avatarUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;

      const userData = await UserData.findOneAndUpdate(
        { user_id },
        { avatar: avatarUrl, updatedAt: Date.now() },
        { new: true, runValidators: true }
      );

      if (!userData) {
        return res.status(404).json({ error: "User data not found" });
      }

      console.log(`${logPrefix} Avatar uploaded successfully for user ${user_id}`);
      res.status(200).json({ url: avatarUrl });
    } catch (error) {
      console.error(`${logPrefix} Error: ${error.message}`);
      next(error);
    }
  },
];