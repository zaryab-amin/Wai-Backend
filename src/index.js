// make bluebird default Promise
Promise = require("bluebird");
const { initializeConfig } = require("./config/vars");

const dotenv = require("dotenv");

const fs = require("fs");
const path = require("path");
dotenv.config();
// const app = require("./config/express");

// open mongoose connection
// configure multer folder
// Directory path where files will be uploaded
const uploadDir = path.join(__dirname, "..", "uploads");

// Ensure the folder exists or create it
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

(async () => {
  try {
    const config = await initializeConfig();

    const app = require("./config/express"); // Pass config to your app
    const mongoose = require("./config/mongoose");
    const logger = require("./config/logger");
    const {
      scheduleTokenCleanup,
      cleanupExpiredTokens,
    } = require("./api/utils/tokenCleanup");

    mongoose.connect();

    // Schedule token cleanup
    scheduleTokenCleanup();

    // Run initial cleanup
    cleanupExpiredTokens().catch((error) => {
      console.error("Initial token cleanup failed:", error);
    });

    app.listen(config.port, () => {
      console.log(
        `Server running on port ${config.port} in ${config.env} mode`
      );
    });
  } catch (error) {
    console.error("Failed to load configuration:", error);
    process.exit(1); // Exit if critical config cannot be loaded
  }
})();

/**
 * Exports express
 * @public
 */
// module.exports = app;
