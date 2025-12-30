const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const fixObjectIdIssueForPurchases = async (purchases) => {
  try {
    const purchasedCourses = await purchases.find();
    for await (const purchasedCourse of purchasedCourses) {
      if (mongoose.Types.ObjectId.isValid(purchasedCourse?.courseId)) {
        await purchases.updateOne(
          { _id: purchasedCourse?._id },
          {
            $set: {
              course: purchasedCourse?.courseId,
            },
          }
        );
      }
    }
    console.log("Finished parsing objectid for purchased courses");
  } catch (error) {
    console.error("Error parsing course objectId", error);
    throw error;
  }
};

const up = async (db) => {
  try {
    const purchases = db.collection("purchases");
    await fixObjectIdIssueForPurchases(purchases);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
