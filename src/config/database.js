const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const MONGO_URI = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=admin`;
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected...');
    } catch (err) {
        console.error("Database connection error", err.message);
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;