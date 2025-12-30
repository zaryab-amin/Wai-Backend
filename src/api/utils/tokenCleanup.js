const Token = require("../models/token.model");
const cron = require("node-cron");

/**
 * Clean up expired and used tokens
 */
const cleanupExpiredTokens = async () => {
  try {
    console.log("Starting token cleanup...");
    const deletedCount = await Token.cleanupExpiredTokens();
    console.log(`Token cleanup completed. Deleted ${deletedCount} tokens.`);
    return deletedCount;
  } catch (error) {
    console.error("Error during token cleanup:", error);
    throw error;
  }
};

/**
 * Schedule token cleanup to run every hour
 */
const scheduleTokenCleanup = () => {
  // Run every hour at minute 0
  cron.schedule("0 * * * *", async () => {
    console.log("Running scheduled token cleanup...");
    try {
      await cleanupExpiredTokens();
    } catch (error) {
      console.error("Scheduled token cleanup failed:", error);
    }
  });

  console.log("Token cleanup scheduled to run every hour");
};

/**
 * Manual cleanup function for immediate use
 */
const manualCleanup = async () => {
  try {
    return await cleanupExpiredTokens();
  } catch (error) {
    console.error("Manual token cleanup failed:", error);
    throw error;
  }
};

module.exports = {
  cleanupExpiredTokens,
  scheduleTokenCleanup,
  manualCleanup,
};
