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

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
app.use(limiter);

app.use((req, res, next) => {
    req.headers['user-agent'] = new userAgent().toString();
    delete req.headers['x-whatsapp-client'];
    delete req.headers['x-whatsapp-version'];
    req.headers['accept'] = 'application/json, text/plain, */*';
    req.headers['cache-control'] = 'no-cache';
    req.headers['pragma'] = 'no-cache';
    req.headers['x-request-id'] = crypto.randomBytes(16).toString('hex');
    next();
});

app.use('/', (req, res) => {
    const targetUrl = req.query.url || req.body.url;

    if (!targetUrl || !/^https?:\/\/(.*\.)?(whatsapp\.net|cdn\.whatsapp\.net|graph\.whatsapp\.net|facebook\.com)/.test(targetUrl)) {
        return res.status(400).json({
            error: 'Invalid or missing target URL.',
            requestId: req.headers['x-request-id'],
        });
    }

    console.log(`[${new Date().toISOString()}] Proxying request [${req.headers['x-request-id']}] to ${targetUrl}`);

    proxy.web(req, res, { target: targetUrl }, (err) => {
        console.error(`[${new Date().toISOString()}] Proxy error [${req.headers['x-request-id']}]: ${err.message}`);
        res.status(502).json({
            error: 'Proxy failed.',
            requestId: req.headers['x-request-id'],
        });
    });
});

app.on('upgrade', (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    const targetUrl = parsed.query.url;

    if (!targetUrl || !/^wss?:\/\/(.*\.)?(whatsapp\.net|cdn\.whatsapp\.net|graph\.whatsapp\.net|facebook\.com)/.test(targetUrl)) {
        socket.destroy();
        return;
    }

    console.log(`[${new Date().toISOString()}] Upgrading to WebSocket for ${targetUrl}`);

    proxy.ws(req, socket, head, { target: targetUrl }, (err) => {
        console.error(`[${new Date().toISOString()}] WebSocket proxy error: ${err.message}`);
        socket.end();
    });
});

proxy.on('error', (err, req, res) => {
    console.error(`[${new Date().toISOString()}] Proxy error: ${err.message}`);
    if (res.write) {
        res.status(502).json({
            error: 'Proxy error occurred.',
            requestId: req.headers['x-request-id'] || 'unknown',
        });
    }
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Proxy server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Shutting down proxy server...');
    proxy.close();
    process.exit(0);
});
