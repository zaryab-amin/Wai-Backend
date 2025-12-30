const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      match: /^\S+@\S+\.\S+$/,
      required: true,
      trim: true,
      lowercase: true,
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add TTL index to automatically delete expired tokens
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to clean up expired tokens
tokenSchema.statics.cleanupExpiredTokens = async function () {
  try {
    const result = await this.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        {
          isUsed: true,
          createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }, // Delete used tokens older than 24 hours
      ],
    });
    console.log(`Cleaned up ${result.deletedCount} expired/used tokens`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up expired tokens:", error);
    throw error;
  }
};

// Static method to find valid token
tokenSchema.statics.findValidToken = async function (token) {
  try {
    const tokenData = await this.findOne({
      token,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });
    return tokenData;
  } catch (error) {
    console.error("Error finding valid token:", error);
    throw error;
  }
};

module.exports = mongoose.model("Token", tokenSchema);
