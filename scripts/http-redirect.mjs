// Tiny HTTP server that redirects all requests to HTTPS
import { createServer } from "node:http";

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "3001", 10);

const server = createServer((req, res) => {
  const host = (req.headers.host || "localhost").replace(`:${HTTP_PORT}`, `:${HTTPS_PORT}`);
  const location = `https://${host}${req.url}`;
  res.writeHead(301, { Location: location });
  res.end();
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP → HTTPS redirect: http://0.0.0.0:${HTTP_PORT} → https://...:${HTTPS_PORT}`);
});
