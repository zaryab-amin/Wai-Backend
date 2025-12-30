const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
dotenv.config();

const createPrescientOrganization = async (organizations, users) => {
  try {
    const organizationObjectId = new ObjectId("674d95113d6b07721a9fc17c");
    const organizationId = uuidv4();
    // Check if organization already exists first
    const existingOrganization = await organizations.findOne({
      _id: organizationObjectId,
    });

    console.log("Existing organization:", existingOrganization);
    let organization = {};

    if (!existingOrganization) {
      // Create organization first
      const prescientAcademyOrganization = {
        name: "IAE",
        role: "organization",
        isVerified: true,
        isActive: true,
        _id: organizationObjectId,
        organizationId,
        planType: "premium",
        freeTrialEndDate: null,
        isRestricted: false,
        subscriptionStatus: "active",
        numberOfUsers: 100,
        signatoryUser: null, // Will be updated after user creation
      };

      console.log("Creating new organization...");
      organization = await organizations.insertOne(
        prescientAcademyOrganization
      );
    } else {
      console.log("Organization already exists, updating...");
      organization = await organizations.updateOne(
        { _id: organizationObjectId },
        {
          $set: {
            planType: "premium",
            isRestricted: false,
            subscriptionStatus: "active",
            numberOfUsers: 100,
          },
        }
      );
      // Set insertedId for consistency
      organization.insertedId = organizationObjectId;
    }

    // Now handle the signatory user
    const userEmail = "fabrice.mouret@prescientsecurity.com";

    // Check if user exists with this email and organization
    const existingUser = await users.findOne({
      email: userEmail,
      organization: organizationObjectId,
    });

    let user = {};

    if (!existingUser) {
      // Check if user exists with this email but different organization
      const userWithSameEmail = await users.findOne({ email: userEmail });

      if (userWithSameEmail) {
        console.log(
          "User with same email exists in different organization, updating..."
        );
        user = await users.updateOne(
          { email: userEmail },
          {
            $set: {
              organization: organizationObjectId,
              isSignatoryUser: true,
              role: "super-admin",
              userType: "organization",
              isActivated: true,
              hasAcceptedTerms: true,
              isNotificationEnabled: true,
            },
          }
        );
      } else {
        console.log("Creating new signatory user...");
        const userObjectId = new mongoose.Types.ObjectId();
        const prescientAcademySignatory = {
          email: userEmail,
          name: "Fabrice Mouret",
          role: "super-admin",
          isActivated: true,
          userType: "organization",
          hasAcceptedTerms: true,
          hasAcceptedSaasAgreement: true,
          organization: organizationObjectId,
          isSignatoryUser: true,
          isNotificationEnabled: true,
          _id: userObjectId,
        };

        user = await users.insertOne(prescientAcademySignatory);

        // Update organization with signatory user ID
        await organizations.updateOne(
          { _id: organizationObjectId },
          { $set: { signatoryUser: userObjectId } }
        );
      }
    } else {
      console.log(
        "Signatory user already exists for this organization, updating..."
      );
      user = await users.updateOne(
        { email: userEmail, organization: organizationObjectId },
        {
          $set: {
            isSignatoryUser: true,
            role: "super-admin",
            userType: "organization",
            isActivated: true,
            hasAcceptedTerms: true,
            isNotificationEnabled: true,
          },
        }
      );
    }

    return { user, organization };
  } catch (error) {
    console.error("Error creating Prescient organization:", error);
    console.error("Error details:", error.message);
    return {};
  }
};

const addOrgIdToCertificates = async (certificates, organization) => {
  try {
    const result = await certificates.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} certificates`);
  } catch (error) {
    console.error("Error adding org id to certificates:", error);
  }
};

const addOrgIdToCoupons = async (coupons, organization) => {
  try {
    const result = await coupons.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} coupons`);
  } catch (error) {
    console.error("Error in adding org id to coupons:", error);
  }
};

const addOrgIdToCouponUsages = async (couponusages, organization) => {
  try {
    const result = await couponusages.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} coupon usages`);
  } catch (error) {
    console.error("Error in adding org id to couponusages:", error);
  }
};

const addOrgIdToCourseLectures = async (courselectures, organization) => {
  try {
    const result = await courselectures.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} course lectures`);
  } catch (error) {
    console.error("Error in adding org id to courselectures:", error);
  }
};

const addOrgIdToCourseModules = async (coursemodules, organization) => {
  try {
    const result = await coursemodules.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} course modules`);
  } catch (error) {
    console.error("Error in adding org id to coursemodules:", error);
  }
};

const addOrgIdToCourses = async (courses, organization) => {
  try {
    const result = await courses.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} courses`);
  } catch (error) {
    console.error("Error in adding org id to courses:", error);
  }
};

const addOrgIdToFolders = async (folders, organization) => {
  try {
    const result = await folders.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} folders`);
  } catch (error) {
    console.error("Error in adding org id to folders:", error);
  }
};

const addOrgIdToInvites = async (invites, organization) => {
  try {
    const result = await invites.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} invites`);
  } catch (error) {
    console.error("Error in adding org id to invites:", error);
  }
};

const addOrgIdToLectureVideos = async (lecturevideos, organization) => {
  try {
    const result = await lecturevideos.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} lecture videos`);
  } catch (error) {
    console.error("Error in adding org id to lecturevideos:", error);
  }
};

const addOrgIdToPasswordResetTokens = async (
  passwordresettokens,
  organization
) => {
  try {
    const result = await passwordresettokens.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} password reset tokens`);
  } catch (error) {
    console.error("Error in adding org id to passwordresettokens:", error);
  }
};

const addOrgIdToPurchaseQuizzes = async (purchasequizzes, organization) => {
  try {
    const result = await purchasequizzes.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} purchase quizzes`);
  } catch (error) {
    console.error("Error in adding org id to purchasequizzes:", error);
  }
};

const addOrgIdToPurchases = async (purchases, organization) => {
  try {
    const result = await purchases.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} purchases`);
  } catch (error) {
    console.error("Error in adding org id to purchases:", error);
  }
};

const addOrgIdToQuizQuestions = async (quizquestions, organization) => {
  try {
    const result = await quizquestions.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} quiz questions`);
  } catch (error) {
    console.error("Error in adding org id to quizquestions:", error);
  }
};

const addOrgIdToQuizzes = async (quizzes, organization) => {
  try {
    const result = await quizzes.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} quizzes`);
  } catch (error) {
    console.error("Error in adding org id to quizzes:", error);
  }
};

const addOrgIdToRefreshTokens = async (refreshtokens, organization) => {
  try {
    const result = await refreshtokens.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} refresh tokens`);
  } catch (error) {
    console.error("Error in adding org id to refreshtokens:", error);
  }
};

const addOrgIdToReports = async (reports, organization) => {
  try {
    const result = await reports.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} reports`);
  } catch (error) {
    console.error("Error in adding org id to reports:", error);
  }
};

const addOrgIdToRequestCourses = async (requestcourses, organization) => {
  try {
    const result = await requestcourses.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} request courses`);
  } catch (error) {
    console.error("Error in adding org id to requestcourses:", error);
  }
};

const addOrgIdToScreenshots = async (screenshots, organization) => {
  try {
    const result = await screenshots.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} screenshots`);
  } catch (error) {
    console.error("Error in adding org id to screenshots:", error);
  }
};

const addOrgIdToTemplateCourses = async (templatecourses, organization) => {
  try {
    const result = await templatecourses.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} template courses`);
  } catch (error) {
    console.error("Error in adding org id to templatecourses:", error);
  }
};

const addOrgIdToTemplates = async (templates, organization) => {
  try {
    const result = await templates.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} templates`);
  } catch (error) {
    console.error("Error in adding org id to templates:", error);
  }
};

const addOrgIdToTokens = async (tokens, organization) => {
  try {
    const result = await tokens.updateMany(
      { organization: { $exists: false } },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} tokens`);
  } catch (error) {
    console.error("Error in adding org id to tokens:", error);
  }
};

const addOrgIdToUsers = async (users, organization) => {
  try {
    // Only update users that don't already have an organization assigned
    const result = await users.updateMany(
      {
        organization: { $exists: false },
        email: { $ne: "fabrice.mouret@prescientsecurity.com" }, // Skip the signatory user
      },
      { $set: { organization: organization?.insertedId } }
    );
    console.log(`Updated ${result.modifiedCount} users`);
  } catch (error) {
    console.error("Error in adding org id to users:", error);
  }
};

// Function to check and fix potential index issues
const checkAndFixIndexes = async (db) => {
  try {
    console.log("Checking for problematic indexes...");

    // Check organizations collection indexes
    const orgIndexes = await db.collection("organizations").indexes();
    console.log(
      "Organization indexes:",
      orgIndexes.map((idx) => idx.name)
    );

    // Check users collection indexes
    const userIndexes = await db.collection("users").indexes();
    console.log(
      "User indexes:",
      userIndexes.map((idx) => idx.name)
    );

    // If there's an email-only index on organizations, drop it
    const orgEmailIndex = orgIndexes.find(
      (idx) => idx.key && idx.key.email && !idx.key.organization
    );
    if (orgEmailIndex) {
      console.log(
        "Found standalone email index on organizations collection, dropping it..."
      );
      await db.collection("organizations").dropIndex("email_1");
      console.log("Email index on organizations dropped successfully");
    }

    // Check for any problematic user indexes
    const userEmailOnlyIndex = userIndexes.find(
      (idx) => idx.key && idx.key.email && !idx.key.organization
    );
    if (userEmailOnlyIndex) {
      console.log("Found standalone email index on users collection...");
      console.log(
        "This may cause conflicts with the compound index (email + organization)"
      );
    }
  } catch (error) {
    console.error("Error checking/fixing indexes:", error);
  }
};

const up = async (db) => {
  try {
    // Check and fix indexes first
    await checkAndFixIndexes(db);

    const organizations = db.collection("organizations");
    const users = db.collection("users");
    const certificates = db.collection("certificates");
    const coupons = db.collection("coupons");
    const couponusages = db.collection("couponusages");
    const courselectures = db.collection("courselectures");
    const coursemodules = db.collection("coursemodules");
    const courses = db.collection("courses");
    const folders = db.collection("folders");
    const invites = db.collection("invites");
    const lecturevideos = db.collection("lecturevideos");
    const passwordresettokens = db.collection("passwordresettokens");
    const purchasequizzes = db.collection("purchasequizzes");
    const purchases = db.collection("purchases");
    const quizquestions = db.collection("quizquestions");
    const quizzes = db.collection("quizzes");
    const refreshtokens = db.collection("refreshtokens");
    const reports = db.collection("reports");
    const requestcourses = db.collection("requestcourses");
    const screenshots = db.collection("screenshots");
    const templatecourses = db.collection("templatecourses");
    const templates = db.collection("templates");
    const tokens = db.collection("tokens");

    console.log("Creating/updating Prescient organization...");
    const { organization = {}, user = {} } = await createPrescientOrganization(
      organizations,
      users
    );

    if (!organization?.insertedId) {
      console.log("Error: Organization was not created/updated properly");
      return;
    }

    console.log("Organization created/updated successfully");
    console.log("Adding organization ID to all collections...");

    await addOrgIdToCertificates(certificates, organization);
    await addOrgIdToCoupons(coupons, organization);
    await addOrgIdToCouponUsages(couponusages, organization);
    await addOrgIdToCourseLectures(courselectures, organization);
    await addOrgIdToCourseModules(coursemodules, organization);
    await addOrgIdToCourses(courses, organization);
    await addOrgIdToFolders(folders, organization);
    await addOrgIdToInvites(invites, organization);
    await addOrgIdToLectureVideos(lecturevideos, organization);
    await addOrgIdToPasswordResetTokens(passwordresettokens, organization);
    await addOrgIdToPurchaseQuizzes(purchasequizzes, organization);
    await addOrgIdToPurchases(purchases, organization);
    await addOrgIdToQuizQuestions(quizquestions, organization);
    await addOrgIdToQuizzes(quizzes, organization);
    await addOrgIdToRefreshTokens(refreshtokens, organization);
    await addOrgIdToReports(reports, organization);
    await addOrgIdToRequestCourses(requestcourses, organization);
    await addOrgIdToScreenshots(screenshots, organization);
    await addOrgIdToTemplateCourses(templatecourses, organization);
    await addOrgIdToTemplates(templates, organization);
    await addOrgIdToTokens(tokens, organization);
    await addOrgIdToUsers(users, organization);

    console.log("✅ Migration completed successfully!");
    console.log("Organization ID:", organization.insertedId);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
