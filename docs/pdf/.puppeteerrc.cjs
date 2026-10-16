// Chrome for Testing, downloaded by "npm ci", is stored in node_modules (ignored by git) instead
// of the user profile: everything the PDF build needs stays in docs/pdf.
const { join } = require("node:path");

module.exports = {
  cacheDirectory: join(__dirname, "node_modules", ".puppeteer"),
};
