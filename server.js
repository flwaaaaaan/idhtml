const http = require("http");
const { handleRequest } = require("./app");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Admin page: http://${HOST}:${PORT}/admin?key=${process.env.ADMIN_SECRET || "admin123"}`);
});
