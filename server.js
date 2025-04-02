const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config');
const routes = require('./routes');
const errorHandler = require('./middlewares/error');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
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