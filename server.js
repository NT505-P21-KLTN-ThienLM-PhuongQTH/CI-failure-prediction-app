const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./src/config');
const routes = require('./src/routes');
const errorHandler = require('./src/middlewares/error');

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Connect to database
connectDB();

// Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});