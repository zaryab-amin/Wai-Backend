require("dotenv").config();
const mongoose = require("mongoose");

const DEFAULT_ORG_ID = "674d95113d6b07721a9fc17c"; // <- Replace with actual default org ID

const up = async (db) => {
  try {
    const User = db.collection("users");
    const result = await User.updateMany(
      {
        $or: [{ organization: null }, { organization: { $exists: false } }],
      },
      { $set: { organization: mongoose.Types.ObjectId(DEFAULT_ORG_ID) } }
    );

    console.log("✅ Update Result:", result);
    console.log(
      `✅ Matched ${result.matchedCount || result.matched || 0}, Updated ${
        result.modifiedCount || result.modified || 0
      } users with default organization ID.`
    );
  } catch (err) {
    console.error("❌ Error updating users:", err);
    throw err;
  }
};

module.exports = { up };
