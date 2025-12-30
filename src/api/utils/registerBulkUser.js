const mongoose = require("mongoose");
const User = require("../models/user.model");
const Token = require("../models/token.model");
const emailProvider = require("../services/emails/emailProvider");
const jwt = require("jsonwebtoken");
const { getConfig } = require("../../config/vars");

const makeToken = (email) => {
  const config = getConfig();
  const expirationDate = new Date();
  expirationDate.setHours(new Date().getHours() + 72);
  return jwt.sign({ email, expirationDate }, config.jwtSecret);
};

async function registerBulkAdminUsers(users) {
  try {
    const config = getConfig();
    await mongoose.connect(config.mongo?.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(users);
    const emailList = users.map((user) => user.email);

    const existingUsers = await User.find({ email: { $in: emailList } }).exec();

    if (existingUsers.length > 0) {
      const existingEmails = existingUsers.map((user) => user.email);
      console.error("Error: Emails are already registered", existingEmails);
      process.exit(1);
    }

    const usersToInsert = users.map((userData) => new User(userData));

    const insertedUsers = await User.insertMany(usersToInsert);

    const results = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const user of insertedUsers) {
      const { email } = user;
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      });
      // eslint-disable-next-line no-await-in-loop
      await tokenRecord.save();
      emailProvider.sendEmailVerification(user, token);

      results.push({
        email,
        status: "success",
        message: "User registered successfully",
        token,
        user: user.transform(),
      });
    }

    console.log("Bulk registration completed successfully");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = registerBulkAdminUsers;
