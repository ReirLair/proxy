require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const HUGGINGFACE_SPACE_URL = process.env.HUGGINGFACE_SPACE_URL;

app.use('/', createProxyMiddleware({
  target: HUGGINGFACE_SPACE_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: {
    '^/': '/',
  },
  onProxyReq(proxyReq, req, res) {
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reverse proxy server running on port ${PORT}`);
});
