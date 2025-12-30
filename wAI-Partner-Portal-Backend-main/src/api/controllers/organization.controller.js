const moment = require("moment-timezone");
const Organization = require("../models/organization.model");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/user.model");
const emailProvider = require("../services/emails/emailProvider");
const jwt = require("jsonwebtoken");
const { ReqLogger } = require("../utils/Logger");
const { ObjectId } = require("mongodb");
const { default: axios } = require("axios");
const Token = require("../models/token.model");
const {
  createOrganizationSchema,
} = require("../validations/organization.validation");
const mongoose = require("mongoose");
const { ORGANIZATION_ADMIN } = require("../middlewares/auth");
const { uploadFile, getSignedUrlFile } = require("./gcs.controller");
const { queryBuilder } = require("../utils/queryBuilder");
const { getConfig } = require("../../config/vars");

function generateTokenResponse(user, accessToken) {
  const config = getConfig();
  const tokenType = "Bearer";
  const expiresIn = moment().add(
    isNaN(Number(config?.jwtExpirationInterval))
      ? 3600
      : Number(config?.jwtExpirationInterval),
    "minutes"
  );
  return {
    tokenType,
    accessToken,
    expiresIn,
  };
}

const makeToken = (email) => {
  const config = getConfig();
  const expirationDate = new Date();
  expirationDate.setHours(new Date().getHours() + 72);
  return jwt.sign({ email, expirationDate }, config.jwtSecret);
};

const allowedExtensions = ["png", "jpg", "jpeg"];

exports.registerOrganization = async (req, res, next) => {
  try {
    const { payload } = req.body;
    const file = req?.file;

    console.log(payload);

    const organizationData = req.body;
    const { name, signatoryName, signatoryEmail, website, phoneNumber } =
      organizationData;

    await createOrganizationSchema.validateAsync({
      name,
      signatoryName,
      website,
      phoneNumber,
      signatoryEmail,
    });

    const isOrganizationExist = await Organization.findOne({
      name: name?.trim(),
    }).exec();

    if (isOrganizationExist) {
      ReqLogger(req, "error", "An organization with this name already exists");
      return res.status(400).json({
        message: "An organization with this name already exists",
        success: false,
      });
    }

    const isUserExist = await User.findOne({
      email: signatoryEmail?.trim()?.toLowerCase(),
    });
    if (isUserExist) {
      ReqLogger(
        req,
        "error",
        "Email is already registered. Please log in instead."
      );
      return res.status(400).json({
        message: "Email is already registered. Please log in instead.",
        success: false,
      });
    }

    let key = "";
    if (req?.file) {
      const extension = req?.file?.originalname
        ?.split(".")
        ?.pop()
        ?.toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return res
          .status(400)
          .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
      }
      const { key: imageKey } = await uploadFile(file, "organization-images");
      key = imageKey;
    }

    const organizationId = uuidv4({ format: "hex" });

    const _id = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    // Calculate free trial end date (30 days from now)
    const freeTrialEndDate = moment().add(30, "days").toDate();
    // const freeTrialEndDate = moment().add(1, "minute").toDate();

    await Promise.all([
      User.create({
        _id: userId,
        email: signatoryEmail?.trim()?.toLowerCase(),
        name: signatoryName?.trim(),
        role: ORGANIZATION_ADMIN,
        isActivated: true,
        userType: "organization",
        organization: _id,
        isSignatoryUser: true,
        isNotificationEnabled: true,
      }),
      Organization.create({
        organizationId,
        _id,
        signatoryUser: userId,
        name: name?.trim(),
        website,
        phoneNumber,
        isActive: true,
        organizationLogo: key,
        planType: "freemium", // Default to freemium plan
        freeTrialEndDate: freeTrialEndDate, // Set 30-day trial end date
        isRestricted: false,
      }),
    ]);

    // Send welcome email with trial information
    // emailProvider.sendOrganizationWelcome(
    //   { name: name?.trim(), email: signatoryEmail?.trim()?.toLowerCase() },
    //   freeTrialEndDate
    // );

    ReqLogger(
      req,
      "info",
      "The registration of your organization has been successfully completed. "
    );
    return res.status(200).json({
      status: "success",
      message:
        "The registration of your organization has been successfully completed. Your free 30-day trial has started. Please login with your signatory user credentials",
    });
  } catch (error) {
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { token } = req.body;
    const config = getConfig();
    if (!token) {
      ReqLogger(req, "error", "Unable to verify organization.");
      res.status(403);
      res.send("Unable to verify organization.");
      return;
    }
    const tokenData = await Token.findOne({ token });
    if (!tokenData || tokenData.isUsed || tokenData.expiresAt < new Date()) {
      return res.status(403).json({
        status: "failed",
        message: "Token Expired",
      });
    }

    tokenData.isUsed = true;
    await tokenData.save();
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      ReqLogger(
        req,
        "error",
        "Sorry, but we couldn't log you in with the provided credentials. Please ensure they are correct and try again."
      );
      res.status(403);
      res.send(
        "Sorry, but we couldn't log you in with the provided credentials. Please ensure they are correct and try again."
      );
      return;
    }
    if (
      !decoded.hasOwnProperty("email") ||
      !decoded.hasOwnProperty("expirationDate")
    ) {
      ReqLogger(
        req,
        "error",
        "Sorry, but we couldn't log you in with the provided credentials. Please ensure they are correct and try again."
      );
      res.status(403);
      res.send(
        "Sorry, but we couldn't log you in with the provided credentials. Please ensure they are correct and try again."
      );
      return;
    }
    console.log("decode ------------------->", decoded);
    const { email } = decoded;
    const body = {
      email,
      organization: tokenData?.organization,
    };
    console.log(body);
    const { organization, accessToken, userContext } =
      await Organization.findAndGenerateToken(body);
    console.log("organization----------------->: " + organization);
    console.log("accessToken------------------>: " + accessToken);
    const newToken = generateTokenResponse(organization, accessToken);
    console.log("newToken------------------>: " + newToken);
    const organizationTransformed = organization.transform();
    organization.lastLogin = new Date();

    // Check if free trial has expired and update restriction status if needed
    if (
      organization.planType === "freemium" &&
      organization.isFreeTrialExpired() &&
      !organization.isRestricted
    ) {
      await organization.restrictAccount();
    }

    await organization.save();
    // res.cookie("userContext", userContext.randomString, {
    //   httpOnly: true,
    //   domain: process.env.NODE_ENV === "production" ? "wai-partner-portal.fintra.ai" : undefined,  // Local pe no domain
    //   secure: true,
    //   sameSite: "lax",
    //   maxAge: 14400000,
    // });
    res.cookie("userContext", userContext.randomString, {
      httpOnly: true,
      secure: true,
      sameSite: "none", // Required for cross-origin
      maxAge: 14400000,
    });

    // Include free trial information in the response
    const trialInfo =
      organization.planType === "freemium"
        ? {
            freeTrialEndDate: organization.freeTrialEndDate,
            daysRemaining: Math.max(
              0,
              Math.ceil(
                (new Date(organization.freeTrialEndDate) - new Date()) /
                  (1000 * 60 * 60 * 24)
              )
            ),
            isRestricted: organization.isRestricted,
          }
        : null;

    ReqLogger(
      req,
      "info",
      "Welcome back! Your organization has been logged in successfully."
    );
    return res.status(200).json({
      status: "success",
      message:
        "Welcome back! Your organization has been logged in successfully.",
      token: newToken,
      user: organizationTransformed,
      trialInfo: trialInfo,
    });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

exports.loginVerification = async (req, res, next) => {
  try {
    const organizationData = req.body;
    const config = getConfig();
    const { email, recaptchaValue } = organizationData;
    const existingUser = await User.findOne({
      email,
    }).exec();
    2;
    const existingOrganization = await Organization.findOne({
      signatoryUser: existingUser._id,
    }).exec();

    console.log(existingOrganization);

    const verificationResponse = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      {},
      {
        params: {
          secret: config.recaptchaSecret,
          response: recaptchaValue,
        },
      }
    );

    const verificationResult = verificationResponse.data;
    if (verificationResult) {
      if (!existingOrganization) {
        ReqLogger(
          req,
          "error",
          "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again."
        );
        return res.status(200).json({
          message:
            "A magic link has been sent to your email address, if it exists in our system",
        });
      }

      const { isActive } = existingOrganization;
      if (!isActive) {
        const tokenData = await Token.findOne({ email: email, isUsed: false });
        if (tokenData) {
          tokenData.isUsed = true;
          await tokenData.save();
          console.log("tokendATA---------->", tokenData);
        }

        const token = makeToken(email);
        const tokenRecord = new Token({
          token,
          email,
          isUsed: false,
          expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        });
        await tokenRecord.save();
        emailProvider.sendOrganizationEmailVerification(
          existingOrganization,
          token
        );
        return res.status(400).json({
          message:
            "Your account has not been activated. Please check your email for the activation link.",
        });
      }
      const token = makeToken(email);
      emailProvider.sendOrganizationVerifyLogin(existingOrganization, token);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization: existingOrganization._id,
      });
      await tokenRecord.save();
      ReqLogger(
        req,
        "info",
        "A magic link has been dispatched to your email address. Please check your email and click on the link to continue."
      );
      return res.status(200).json({
        status: "success",
        message:
          "A magic link has been dispatched to your email address. Please check your email and click on the link to continue.",
      });
    }
  } catch (error) {
    return next(error);
  }
};

// New endpoint to get subscription/trial status
exports.getSubscriptionStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = await Organization.findOne({
      signatoryUser: userId,
    }).exec();

    if (!organization) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this account."
      );
      return res.status(404).json({
        message: "Organization not found",
        success: false,
      });
    }

    // Check if free trial has expired and update restriction status if needed
    if (
      organization.planType === "freemium" &&
      organization.isFreeTrialExpired() &&
      !organization.isRestricted
    ) {
      await organization.restrictAccount();
    }

    const daysRemaining = organization.freeTrialEndDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(organization.freeTrialEndDate) - new Date()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

    ReqLogger(req, "info", "Subscription status retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Subscription status retrieved successfully",
      data: {
        planType: organization.planType,
        subscriptionStatus: organization.subscriptionStatus,
        freeTrialEndDate: organization.freeTrialEndDate,
        daysRemaining: daysRemaining,
        isRestricted: organization.isRestricted,
        isAccessAllowed: organization.isAccessAllowed(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// New endpoint to upgrade to premium
exports.upgradeToPremium = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = await Organization.findOne({
      signatoryUser: userId,
    }).exec();

    if (!organization) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this account."
      );
      return res.status(404).json({
        message: "Organization not found",
        success: false,
      });
    }

    // Update organization to premium plan
    organization.planType = "premium";
    organization.isRestricted = false;
    organization.subscriptionStatus = "active";

    await organization.save();

    // Here you would typically integrate with your payment processor
    // This is just a placeholder for the actual implementation

    ReqLogger(req, "info", "Organization upgraded to premium successfully");
    return res.status(200).json({
      status: "success",
      message: "Organization upgraded to premium successfully",
      data: {
        planType: organization.planType,
        subscriptionStatus: organization.subscriptionStatus,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Admin endpoint to manually restrict expired free trials
exports.restrictExpiredFreeTrials = async (req, res, next) => {
  try {
    const config = getConfig();

    // Ensure user is from Prescient organization (admin)
    if (req?.user?.organization?.toString() !== config.prescientOrgId) {
      ReqLogger(req, "error", "You are not authorized to perform this action.");
      return res.status(403).json({
        message: "Forbidden",
        success: false,
      });
    }

    const result = await Organization.restrictExpiredFreeTrials();

    ReqLogger(
      req,
      "info",
      `Successfully restricted ${result.length} expired free trial accounts`
    );
    return res.status(200).json({
      status: "success",
      message: `Successfully restricted ${result.length} expired free trial accounts`,
      restrictedCount: result.length,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { companyName, companyWebsite, phoneNumber } = req.body;
    const organization = await Organization.findOne({
      signatoryUser: userId,
    }).exec();
    if (!organization) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again."
      );
      return res.status(404).json({
        message:
          "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again.",
        success: false,
      });
    }

    organization.name = companyName;
    organization.website = companyWebsite;
    organization.phoneNumber = phoneNumber;

    await organization.save();

    ReqLogger(req, "info", "Organization successfully updated");

    return res.status(200).json({
      status: "success",
      message: "Organization successfully updated",
      data: organization,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    const organization = await Organization.findOne({ organizationId }).exec();
    if (!organization) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again."
      );
      return res.status(404).json({
        message:
          "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again.",
        success: false,
      });
    }
    await Organization.deleteOne({ organizationId });

    ReqLogger(req, "info", "Organization deleted successfully ");
    return res.status(200).json({
      status: "success",
      message: "Organization successfully deleted",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAllOrganizations = async (req, res, next) => {
  try {
    const config = getConfig();
    const { page = 1, limit = 10, search = "", category, planType } = req.query;
    if (req?.user?.organization?.toString() !== config.prescientOrgId) {
      ReqLogger(req, "error", "You are not authorized to perform this action.");
      return res.status(403).json({
        message: "Forbidden",
        success: false,
      });
    }
    let query = {
      _id: { $ne: new ObjectId(config.prescientOrgId) },
    };
    const filterQuery = queryBuilder([
      { type: "search", field: "name", value: search },
      { type: "field", field: "isActive", value: category },
      { type: "field", field: "planType", value: planType },
    ]);
    const organizations = await Organization.aggregate([
      {
        $match: {
          ...query,
          ...filterQuery,
        },
      },
      { $sort: { createdAt: -1 } },

      { $skip: (page - 1) * limit },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "organization",
          as: "purchases",
        },
      },

      {
        $lookup: {
          from: "purchasequizzes",
          localField: "_id",
          foreignField: "organization",
          as: "purchaseQuizzes",
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "organization",
          as: "users",
        },
      },

      {
        $addFields: {
          totalCourses: { $size: "$purchases" },
          totalQuizzes: { $size: "$purchaseQuizzes" },
          totalUsers: { $size: "$users" },
          totalCourseRevenue: { $sum: "$purchases.amount" },
          totalQuizRevenue: { $sum: "$purchaseQuizzes.amount" },
          daysRemaining: {
            $cond: [
              { $eq: ["$planType", "freemium"] },
              {
                $max: [
                  0,
                  {
                    $ceil: {
                      $divide: [
                        { $subtract: ["$freeTrialEndDate", new Date()] },
                        1000 * 60 * 60 * 24,
                      ],
                    },
                  },
                ],
              },
              null,
            ],
          },
        },
      },

      {
        $addFields: {
          estimatedRevenue: {
            $add: ["$totalCourseRevenue", "$totalQuizRevenue"],
          },
        },
      },

      {
        $project: {
          purchases: 0,
          purchaseQuizzes: 0,
          users: 0,
        },
      },
    ]);

    for await (const organization of organizations) {
      if (organization?.organizationLogo) {
        organization.organizationLogo = await getSignedUrlFile(
          organization?.organizationLogo
        );
      }
    }

    const totalCount = await Organization.countDocuments({
      ...query,
      ...filterQuery,
    });

    ReqLogger(req, "info", "Organization successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Organization successfully retrieved.",
      data: organizations,
      meta: {
        currentPage: page,
        perPage: limit,
        total: totalCount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.toggleOrganizationActiveStatus = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { isActive } = req.body;

    const config = getConfig();

    if (req?.user?.organization?.toString() !== config.prescientOrgId) {
      ReqLogger(req, "error", "You are not authorized to perform this action.");
      return res.status(403).json({
        message: "Forbidden",
        success: false,
      });
    }

    const organization = await Organization.findOne({
      _id: new ObjectId(orgId),
    }).exec();

    if (!organization) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    organization.isActive = !!isActive;

    await organization.save();

    return res.status(200).json({
      status: "success",
      message: "Organization updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizations = async (req, res, next) => {
  try {
    const organizations = await Organization.findOne({
      createdBy: req.user._id,
    })
      .populate("createdBy")
      .sort({ createdAt: -1 })
      .exec();

    console.log(organizations);
    if (!organizations) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again."
      );
      return res.status(404).json({
        message:
          "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again.",
        success: false,
      });
    }

    ReqLogger(req, "info", "Organization successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Organization successfully retrieved.",
      data: organizations,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getListOfOrganizations = async (req, res, next) => {
  try {
    const organizations = await Organization.find().exec();
    ReqLogger(req, "info", "Organization successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Organization successfully retrieved.",
      data: organizations,
    });
  } catch (error) {
    return next(error);
  }
};

exports.activateOrganizationStatus = async (req, res, next) => {
  try {
    const orgData = req.body;
    console.log("orgData: " + orgData);
    const { email, isChecked } = orgData;
    const registeredOrganization = await Organization.findOne({ email }).exec();
    if (isChecked) {
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      });
      await tokenRecord.save();
      emailProvider.sendOrganizationEmailVerification(
        registeredOrganization,
        token
      );
      ReqLogger(req, "info", "Activation Link Send");
      return res.status(200).json({
        status: "success",
        message: "User Activation Email send successfully",
        token,
        user: registeredOrganization,
      });
    } else {
      registeredOrganization.isActive = isChecked;
      await registeredOrganization.save();
      ReqLogger(req, "info", "User Disabled");
      return res.status(200).json({
        status: "success",
        message: "User disabled successfully",
        user: registeredOrganization,
      });
    }
  } catch (error) {
    ReqLogger(req, "error", "Error sending activation link");
    return next(error);
  }
};

exports.verifyOrganizationStatus = async (req, res, next) => {
  try {
    const orgData = req.body;
    console.log("orgData: " + JSON.stringify(orgData));
    const { email, isChecked } = orgData;
    const registeredOrganization = await Organization.findOne({ email }).exec();

    registeredOrganization.isVerified = isChecked;
    registeredOrganization.verifiedBy = req.user._id;
    await registeredOrganization.save();

    console.log(registeredOrganization);
    ReqLogger(req, "info", "organization verification status updated");
    return res.status(200).json({
      status: "success",
      message: "organization verification status updated successfully",
      user: registeredOrganization,
    });
  } catch (error) {
    ReqLogger(req, "error", "Error sending activation link");
    return next(error);
  }
};

exports.activateOrganization = async (req, res, next) => {
  try {
    const { token } = req.body;
    const config = getConfig();
    if (!token) {
      res.status(403);
      res.send("Can't verify user.");
      return;
    }
    const tokenData = await Token.findOne({ token });
    console.log("tokendATA---------->", tokenData);
    if (!tokenData || tokenData.isUsed || tokenData.expiresAt < new Date()) {
      return res.status(403).json({
        status: "failed",
        message: "Token Expired",
      });
    }

    tokenData.isUsed = true;
    await tokenData.save();

    console.log("token data:", tokenData);

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      res.status(403);
      res.send("Invalid auth credentials.");
      return;
    }
    if (
      !decoded.hasOwnProperty("email") ||
      !decoded.hasOwnProperty("expirationDate")
    ) {
      res.status(403);
      res.send("Invalid auth credentials.");
      return;
    }
    const { email } = decoded;
    const existignOrg = await Organization.findOne({ email }).exec();

    if (!existignOrg) {
      console.log("Organization not found");
      return res.status(400).json({
        message: "Invalid Email Address. Please enter a valid email address!",
        success: false,
      });
    }
    existignOrg.isActive = true;
    await existignOrg.save();

    console.log(existignOrg);

    return res.status(200).json({
      status: "success",
      message:
        "Congratulations! You've successfully verified your email and activated your account.",
    });
  } catch (error) {
    return next(error);
  }
};

exports.getOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;

    const organization = await Organization.findOne({
      organizationId: organizationId,
    }).exec();
    if (!organization) {
      ReqLogger(
        req,
        "error",
        "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again."
      );
      return res.status(404).json({
        message:
          "We're sorry, but there isn't any organization registered with this email address. Please verify the email and try again.",
        success: false,
      });
    }

    ReqLogger(req, "info", "Organization successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Organization successfully retrieved.",
      data: organization,
    });
  } catch (error) {
    return next(error);
  }
};

// New endpoint to manually extend free trial
exports.extendFreeTrial = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { daysToExtend } = req.body;

    const config = getConfig();

    // Ensure user is from Prescient organization (admin)
    if (req?.user?.organization?.toString() !== config.prescientOrgId) {
      ReqLogger(req, "error", "You are not authorized to perform this action.");
      return res.status(403).json({
        message: "Forbidden",
        success: false,
      });
    }

    const organization = await Organization.findOne({ organizationId }).exec();

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
        success: false,
      });
    }

    // Only extend free trial if organization is on freemium plan
    if (organization.planType !== "freemium") {
      return res.status(400).json({
        message: "Only freemium accounts can have trial extensions",
        success: false,
      });
    }

    // Calculate new trial end date
    const currentEndDate = organization.freeTrialEndDate || new Date();
    const newEndDate = moment(currentEndDate)
      .add(daysToExtend, "days")
      .toDate();

    // Update the organization
    organization.freeTrialEndDate = newEndDate;
    organization.isRestricted = false; // Remove restriction if it was applied

    await organization.save();

    // Notify the organization about the extension
    const user = await User.findById(organization.signatoryUser);
    if (user) {
      emailProvider.sendTrialExtension(
        { name: organization.name, email: user.email },
        organization.freeTrialEndDate,
        daysToExtend
      );
    }

    ReqLogger(
      req,
      "info",
      `Free trial extended by ${daysToExtend} days for organization ${organizationId}`
    );
    return res.status(200).json({
      status: "success",
      message: `Free trial extended by ${daysToExtend} days`,
      data: {
        organizationId: organization.organizationId,
        newTrialEndDate: organization.freeTrialEndDate,
        daysRemaining: Math.ceil(
          (newEndDate - new Date()) / (1000 * 60 * 60 * 24)
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// New endpoint to check access status
exports.checkAccessStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = await Organization.findOne({
      signatoryUser: userId,
    }).exec();

    if (!organization) {
      ReqLogger(req, "error", "Organization not found");
      return res.status(404).json({
        message: "Organization not found",
        success: false,
      });
    }

    // Check if free trial has expired and update restriction status if needed
    if (
      organization.planType === "freemium" &&
      organization.isFreeTrialExpired() &&
      !organization.isRestricted
    ) {
      await organization.restrictAccount();
    }

    const isAccessAllowed = organization.isAccessAllowed();
    const daysRemaining = organization.freeTrialEndDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(organization.freeTrialEndDate) - new Date()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

    // If access is not allowed, return appropriate status code
    if (!isAccessAllowed) {
      return res.status(402).json({
        status: "trial_expired",
        message:
          "Your free trial has expired. Please upgrade to premium to continue using the service.",
        data: {
          planType: organization.planType,
          freeTrialEndDate: organization.freeTrialEndDate,
          isRestricted: organization.isRestricted,
          organizationId: organization.organizationId,
        },
      });
    }

    ReqLogger(req, "info", "Access status checked successfully");
    return res.status(200).json({
      status: "success",
      message: "Access allowed",
      data: {
        planType: organization.planType,
        freeTrialEndDate: organization.freeTrialEndDate,
        daysRemaining: daysRemaining,
        isRestricted: organization.isRestricted,
        isAccessAllowed: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};
