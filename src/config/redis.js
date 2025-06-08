const Queue = require('bull');

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
};

const retrieveQueue = new Queue('retrieve-queue', { redis: redisConfig });

const syncQueue = new Queue('sync-queue', { redis: redisConfig });

module.exports = { retrieveQueue, syncQueue };