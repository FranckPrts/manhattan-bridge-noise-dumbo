import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-load API handlers
async function loadHealthHandler() {
  const mod = await import('./api/health.js');
  return mod.default;
}

async function loadReportHandler() {
  const mod = await import('./api/report.js');
  return mod.default;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (req.url === '/api/health' && req.method === 'GET') {
      const handler = await loadHealthHandler();
      const mockReq = { method: 'GET', url: '/api/health' };
      const mockRes = {
        status: 200,
        json: (data) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        },
      };
      await handler(mockReq, mockRes);
    } else if (req.url === '/api/report' && req.method === 'POST') {
      const handler = await loadReportHandler();
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const mockReq = {
          method: 'POST',
          url: '/api/report',
          body: JSON.parse(body),
        };
        const mockRes = {
          status: 201,
          json: (data) => {
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          },
        };
        mockRes.status = (code) => {
          mockRes.statusCode = code;
          return mockRes;
        };
        mockRes.send = (msg) => {
          res.writeHead(mockRes.statusCode || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(msg));
        };
        await handler(mockReq, mockRes);
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = process.env.PORT || 5174;
server.listen(PORT, () => {
  console.log(`Dev API server running on http://localhost:${PORT}`);
});
