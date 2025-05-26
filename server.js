const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const HUGGINGFACE_SPACE_URL = 'https://newservers-xpm.hf.space'; // Replace with your HF Space URL

// Proxy all requests to Hugging Face Space
app.use('/', createProxyMiddleware({
  target: HUGGINGFACE_SPACE_URL,
  changeOrigin: true,
  ws: true, // proxy websockets if needed
  pathRewrite: {
    '^/': '/', // rewrite path if needed
  },
  onProxyReq(proxyReq, req, res) {
    // Optional: modify headers here if needed
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reverse proxy server running on port ${PORT}`);
});
