// controllers/userController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const UserData = require("../models/UserData");
const { jwtConfig } = require("../config");

const register = async (req, res) => {
    const logPrefix = '[register]';
    try {
        const { name, email, password } = req.body;
        console.log('Register request body:', req.body);

        if (!name || !email || !password) {
            console.log('Missing fields:', { name, email, password });
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email,
            password: hashedPassword,
        });
        await user.save();

        const userData = new UserData({
            user_id: user._id,
            fullname: name,
            email: email,
            role: 'user',
            phone: '',
            pronouns: '',
            bio: '',
            github_account: '',
            address: {},
            avatar: '',
        });
        await userData.save();

        console.log(`${logPrefix} User and UserData created successfully for ${email}`);
        res.status(201).json({
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
            message: "User registered successfully"
        });
    } catch (error) {
        console.error(`${logPrefix} Error registering user:`, error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

const login = async (req, res) => {
    const logPrefix = '[login]';
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign({ id: user._id }, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });

        console.log(`${logPrefix} Login successful for ${email}`);
        res.status(200).json({
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
            token,
            message: "Login successful"
        });
    } catch (error) {
        console.error(`${logPrefix} Error logging in user:`, error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

module.exports = { register, login };