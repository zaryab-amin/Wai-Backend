const up = async (db) => {
  try {
    const usersCollection = db.collection("users");
    const email = "adnan.khan@prescientsecurity.com";
    console.log(`🔍 Searching for user with email: ${email}`);
    console.log("");
    const user = await usersCollection.findOne({ email: email });
    if (user) {
      console.log("✅ User found:");
      console.log("==================");
      console.log(`ID: ${user._id}`);
      console.log(`Name: ${user.name || "N/A"}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role || "N/A"}`);
      console.log(`User Type: ${user.userType || "N/A"}`);
      console.log(`Organization: ${user.organization || "N/A"}`);
      console.log(`Is Activated: ${user.isActivated || "N/A"}`);
      console.log(`Is Signatory User: ${user.isSignatoryUser || "N/A"}`);
      console.log(`Has Accepted Terms: ${user.hasAcceptedTerms || "N/A"}`);
      console.log(`Created At: ${user.createdAt || "N/A"}`);
      console.log(`Updated At: ${user.updatedAt || "N/A"}`);
      console.log("");
      console.log("📋 All user fields:");
      console.log(JSON.stringify(user, null, 2));
    } else {
      console.log("❌ User not found with that email address.");
      console.log("");
      console.log("🔍 Checking for similar emails...");
      const similarUsers = await usersCollection
        .find({
          email: { $regex: /adnan\.khan/i },
        })
        .toArray();
      if (similarUsers.length > 0) {
        console.log(
          `Found ${similarUsers.length} users with similar email patterns:`
        );
        similarUsers.forEach((user, index) => {
          console.log(`${index + 1}. ${user.email} (${user.name || "N/A"})`);
        });
      } else {
        console.log("No users found with similar email patterns.");
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
};

module.exports = { up };
