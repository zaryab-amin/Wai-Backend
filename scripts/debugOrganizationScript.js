const { ObjectId } = require("mongodb");

const up = async (db) => {
  try {
    const organizationObjectId = new ObjectId("674d95113d6b07721a9fc17c");
    const collections = [
      "certificates",
      "coupons",
      "couponusages",
      "courselectures",
      "coursemodules",
      "courses",
      "folders",
      "invites",
      "lecturevideos",
      "passwordresettokens",
      "purchasequizzes",
      "purchases",
      "quizquestions",
      "quizzes",
      "refreshtokens",
      "reports",
      "requestcourses",
      "screenshots",
      "templatecourses",
      "templates",
      "tokens",
      "users",
    ];
    console.log("🔍 Debugging organization script...");
    console.log("Organization ID:", organizationObjectId.toString());
    console.log("");
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const totalCount = await collection.countDocuments();
      const noOrgCount = await collection.countDocuments({
        organization: { $exists: false },
      });
      const withOrgCount = await collection.countDocuments({
        organization: { $exists: true },
      });
      const nullOrgCount = await collection.countDocuments({
        organization: null,
      });
      const ourOrgCount = await collection.countDocuments({
        organization: organizationObjectId,
      });
      console.log(`📊 ${collectionName}:`);
      console.log(`   Total documents: ${totalCount}`);
      console.log(`   Without organization field: ${noOrgCount}`);
      console.log(`   With organization field: ${withOrgCount}`);
      console.log(`   With null organization: ${nullOrgCount}`);
      console.log(`   With our organization: ${ourOrgCount}`);
      if (totalCount > 0) {
        const sampleDoc = await collection.findOne();
        console.log(`   Sample document structure:`, Object.keys(sampleDoc));
        if (sampleDoc.organization) {
          console.log(
            `   Sample organization field type: ${typeof sampleDoc.organization}`
          );
          console.log(
            `   Sample organization value: ${sampleDoc.organization}`
          );
        }
      }
      console.log("");
    }
    const orgCollection = db.collection("organizations");
    const orgExists = await orgCollection.findOne({
      _id: organizationObjectId,
    });
    console.log("🏢 Organization check:");
    console.log(`   Organization exists: ${orgExists ? "Yes" : "No"}`);
    if (orgExists) {
      console.log(`   Organization name: ${orgExists.name}`);
      console.log(`   Organization ID: ${orgExists._id}`);
    }
    console.log("");
  } catch (error) {
    console.error("❌ Debug script failed:", error);
    throw error;
  }
};

module.exports = { up };
