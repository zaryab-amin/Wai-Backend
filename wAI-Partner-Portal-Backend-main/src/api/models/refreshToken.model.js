/* eslint-disable quotes */
const mongoose = require("mongoose");
const crypto = require("crypto");
const moment = require("moment-timezone");
const { getConfig } = require("../../config/vars");

/**
 * Refresh Token Schema
 * @private
 */
const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  userEmail: {
    type: "String",
    required: true,
  },
  organization: {
    type: mongoose.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
  expires: { type: Date },
});

refreshTokenSchema.statics = {
  /**
   * Generate a refresh token object and saves it into the database
   *
   * @param {User} user
   * @returns {RefreshToken}
   */
  generate(user) {
    const config = getConfig();
    const userId = user._id;
    const userEmail = user.email;
    const token = `${userId}.${crypto.randomBytes(40).toString("hex")}`;
    const expires = moment().add(
      isNaN(Number(config?.jwtExpirationInterval)) ?
        3600 :
        Number(config?.jwtExpirationInterval),
      "minutes"
    );
    const tokenObject = new RefreshToken({
      token,
      userId,
      userEmail,
      expires,
      organization: user?.organization,
    });
    tokenObject.save();
    return tokenObject;
  },
};

/**
 * @typedef RefreshToken
 */
const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
module.exports = RefreshToken;
