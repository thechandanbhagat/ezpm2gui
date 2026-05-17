const { createProxyMiddleware } = require('http-proxy-middleware');

// Read port from REACT_APP_API_URL or fall back to 3101
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3101';

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({ target: apiUrl, changeOrigin: true })
  );
  app.use(
    '/socket.io',
    createProxyMiddleware({ target: apiUrl, changeOrigin: true, ws: true })
  );
};
