const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected...');
    } catch (err) {
        console.error("Database connection error", err.message);
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;