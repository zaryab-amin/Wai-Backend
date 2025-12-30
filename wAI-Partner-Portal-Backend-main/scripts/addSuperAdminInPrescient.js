const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const PRESCIENT_ORG_ID = "674d95113d6b07721a9fc17c";

const createSuperAdminUser = async (users, userDetails) => {
  try {
    const { email, name } = userDetails;

    // Check if user already exists for this organization
    const existingUser = await users.findOne({
      email,
      organization: PRESCIENT_ORG_ID,
    });

    if (existingUser) {
      console.log(`User ${email} already exists for Prescient organization`);

      // Update existing user to super-admin if not already
      if (existingUser.role !== "super-admin") {
        await users.updateOne(
          { email, organization: PRESCIENT_ORG_ID },
          {
            $set: {
              role: "super-admin",
              userType: "organization",
              isActivated: true,
              hasAcceptedTerms: true,
              hasAcceptedSaasAgreement: true,
              isNotificationEnabled: true,
            },
          }
        );
        console.log(`Updated ${email} to super-admin role`);
      }

      return existingUser;
    }

    const userObjectId = new ObjectId();
    const superAdminUser = {
      _id: userObjectId,
      email,
      name,
      role: "super-admin",
      userType: "organization",
      organization: PRESCIENT_ORG_ID, // <-- keep as string
      isActivated: true,
      hasAcceptedTerms: true,
      hasAcceptedSaasAgreement: true,
      termsAcceptedDate: new Date(),
      saasTermsAcceptedDate: new Date(),
      isNotificationEnabled: true,
      isSignatoryUser: false,
      avatar: "",
      inviteKey: "",
      isInviteAccepted: true,
      invitedBy: null,
      lastLogin: null,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await users.insertOne(superAdminUser);
    console.log(`✅ Super admin user ${email} created successfully`);
    return superAdminUser;
  } catch (error) {
    console.error("❌ Error creating super admin user:", error);
    throw error;
  }
};

const up = async (db) => {
  try {
    const users = db.collection("users");
    const organizations = db.collection("organizations");

    // ✅ FIXED: don't convert _id to ObjectId if it's stored as string
    const prescientOrg = await organizations.findOne({
      _id: PRESCIENT_ORG_ID,
    });

    if (!prescientOrg) {
      console.error("❌ Prescient organization not found!");
      return;
    }

    console.log("✅ Found Prescient organization:", prescientOrg.name);

    const newSuperAdmin = {
      email: "haris.sheikh@issm.ai",
      name: "Haris Sheikh",
    };

    await createSuperAdminUser(users, newSuperAdmin);

    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
};

if (require.main === module) {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  client
    .connect()
    .then(async () => {
      console.log("✅ Connected to MongoDB");
      const db = client.db(); // default database from URI
      await up(db);
    })
    .catch(console.error)
    .finally(() => client.close());
}

module.exports = { up };
