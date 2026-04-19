const { handleRequest } = require("../app");

module.exports = async function handler(req, res) {
  return handleRequest(req, res);
};
