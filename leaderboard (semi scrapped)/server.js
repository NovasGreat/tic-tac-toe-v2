const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const leaderboardPath = path.join(rootDir, 'leaderboard.json');
const defaultLeaderboard = { easy: {}, medium: {}, hard: {} };

if (!fs.existsSync(leaderboardPath)) {
  fs.writeFileSync(leaderboardPath, JSON.stringify(defaultLeaderboard, null, 2));
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      fs.readFile(leaderboardPath, 'utf8', (error, data) => {
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Unable to read leaderboard' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          fs.writeFile(leaderboardPath, JSON.stringify(parsedBody, null, 2), (writeError) => {
            if (writeError) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'Unable to save leaderboard' }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'saved' }));
          });
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Invalid leaderboard payload' }));
        }
      });
      return;
    }
  }

  let requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^\/+/, '');
  const finalPath = path.join(rootDir, safePath);

  if (!finalPath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
    serveFile(res, path.join(finalPath, 'index.html'));
    return;
  }

  serveFile(res, finalPath);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server ready at http://127.0.0.1:${port}`);
});
