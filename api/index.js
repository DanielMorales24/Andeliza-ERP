// Vercel ejecuta Express como función serverless: aquí NO se hace listen().
const app = require('../app');

module.exports = app;
