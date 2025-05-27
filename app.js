const express = require('express');
const httpProxy = require('http-proxy');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const userAgent = require('user-agents');
const crypto = require('crypto');
const url = require('url');

const app = express();
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ws: true,
    secure: process.env.NODE_ENV !== 'development',
    followRedirects: true,
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Avoid CSP issues
    hidePoweredBy: true, // Hide Express signature
}));
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting with stricter limits
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 50, // Reduced to 50 requests per IP
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Enhanced header obfuscation
app.use((req, res, next) => {
    req.headers['user-agent'] = new userAgent({ deviceCategory: 'desktop' }).toString();
    delete req.headers['x-whatsapp-client'];
    delete req.headers['x-whatsapp-version'];
    req.headers['accept'] = 'application/json, text/plain, */*';
    req.headers['cache-control'] = 'no-cache';
    req.headers['pragma'] = 'no-cache';
    req.headers['x-request-id'] = crypto.randomBytes(16).toString('hex');
    req.headers['x-api-key'] = crypto.randomBytes(8).toString('hex'); // Fake API key
    req.headers['referer'] = `https://${crypto.randomBytes(4).toString('hex')}.example.com`; // Random referer
    next();
});

// Proxy HTTP requests
app.use('/', async (req, res) => {
    const targetUrl = req.query.url || req.body.url;

    if (!targetUrl || !/^https?:\/\/(.*\.)?(whatsapp\.net|cdn\.whatsapp\.net|graph\.whatsapp\.net)/.test(targetUrl)) {
        return res.status(400).json({
            error: 'Invalid or missing target URL.',
            requestId: req.headers['x-request-id'],
        });
    }

    console.log(`[${new Date().toISOString()}] Proxying request [${req.headers['x-request-id']}] to ${targetUrl}`);

    // Random delay to mimic human traffic
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));

    proxy.web(req, res, { target: targetUrl }, (err) => {
        console.error(`[${new Date().toISOString()}] Proxy error [${req.headers['x-request-id']}]: ${err.message}`);
        res.status(502).json({
            error: 'Proxy failed.',
            requestId: req.headers['x-request-id'],
        });
    });
});

// Handle WebSocket upgrades
app.on('upgrade', async (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    const targetUrl = parsed.query.url;

    if (!targetUrl || !/^wss?:\/\/(.*\.)?(whatsapp\.net|cdn\.whatsapp\.net|graph\.whatsapp\.net)/.test(targetUrl)) {
        socket.destroy();
        return;
    }

    console.log(`[${new Date().toISOString()}] Upgrading to WebSocket [${req.headers['x-request-id']}]`);

    // Random delay for WebSocket
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));

    proxy.ws(req, socket, head, { target: targetUrl }, (err) => {
        console.error(`[${new Date().toISOString()}] WebSocket proxy error: ${err.message}`);
        socket.end();
    });
});

// Proxy error handling
proxy.on('error', (err, req, res) => {
    console.error(`[${new Date().toISOString()}] Proxy error: ${err.message}`);
    if (res.write) {
        res.status(502).json({
            error: 'Proxy error occurred.',
            requestId: req.headers['x-request-id'] || 'unknown',
        });
    }
});

// Start server
const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Proxy server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down proxy server...');
    proxy.close();
    process.exit(0);
});
