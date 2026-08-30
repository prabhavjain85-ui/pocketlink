const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  const target = process.env.PAINS_API_ORIGIN || "http://127.0.0.1:8787";
  app.use(
    "/api/pains-check",
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
};
