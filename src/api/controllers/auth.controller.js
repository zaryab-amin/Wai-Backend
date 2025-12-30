/* eslint-disable quotes */
const httpStatus = require("http-status");
const moment = require("moment-timezone");
const User = require("../models/user.model");
const RefreshToken = require("../models/refreshToken.model");
const emailProvider = require("../services/emails/emailProvider");
const jwt = require("jsonwebtoken");
const Organization = require("../models/organization.model");
const Token = require("../models/token.model");
const APIError = require("../errors/api-error");
const { default: axios } = require("axios");
const { ReqLogger, InfoLogger } = require("../utils/Logger");
const registerBulkAdminUsers = require("../utils/registerBulkUser");
const { stripHtml } = require("../utils/sanitize");
const { ObjectId, ObjectID } = require("mongodb");
const { PRESCIENT_ORG_ID } = require("../utils/constant");
const { getConfig } = require("../../config/vars");
const bcrypt = require('bcrypt');
const {
  validateUserLoginStatus,
  validateTokenData,
  formatLoginErrorMessage,
  logValidationResult,
} = require("../utils/validationHelpers");
/**
 * Returns a formated object with tokens
 * @private
 */

function generateTokenResponse(user, accessToken) {
  const config = getConfig();
  const tokenType = "Bearer";
  const refreshToken = RefreshToken.generate(user).token;
  const expiresIn = moment().add(
    isNaN(Number(config?.jwtExpirationInterval))
      ? 3600
      : Number(config?.jwtExpirationInterval),
    "minutes"
  );
  return {
    tokenType,
    accessToken,
    refreshToken,
    expiresIn,
  };
}

const makeToken = (email) => {
  const config = getConfig();
  const expirationDate = new Date();
  // Set token expiration to 15 minutes to match database token expiration
  expirationDate.setMinutes(new Date().getMinutes() + 15);
  return jwt.sign({ email, expirationDate }, config.jwtSecret);
};
/**
 * Returns jwt token if registration was successful
 * @public
 */
exports.register = async (req, res, next) => {
  try {
    const userData = req.body;
    const config = getConfig();
    const { email, name, organization, hasAcceptedTerms } = userData;

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      organization: organization ? new ObjectId(organization) : new ObjectId(config.prescientOrgId),
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email is already registered. Please log in instead.",
        success: false,
      });
    }

    // Terms check
    if (!hasAcceptedTerms) {
      return res.status(400).json({ message: "You must accept the terms and conditions." });
    }

    if (organization && organization.toString() !== config.prescientOrgId) {
      const existingUsers = await User.find({ organization }).lean().exec();
      const existingOrganization = await Organization.findOne({ _id: organization }).populate("signatoryUser");

      if (existingUsers.length >= existingOrganization.numberOfUsers - 1) {
        await this.notifyOrgForInactiveUserUpgrade(userData, existingOrganization?.signatoryUser);
        return res.status(400).json({
          message: "Your organization has reached the user limit. Please request an account upgrade.",
        });
      }
    }

    const user = await new User({
      name,
      email: email.toLowerCase(),
      organization: organization ? new ObjectId(organization) : new ObjectId(config.prescientOrgId),
      termsAcceptedDate: new Date(),
      isActivated: false,
    }).save();

      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        organization: user.organization,
      });
      await tokenRecord.save();

    emailProvider.sendEmailVerification(user, token);  // ← Naya function

      return res.status(httpStatus.CREATED).json({
        status: "success",
        message: "Registration successful! Please check your email to set your password.",
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          message: "Email is already registered for this organization",
          success: false,
        });
      }
    next(error);
  }
};

exports.notifyOrgForInactiveUserUpgrade = async (user, orgAdmin) => {
  try {
    // create an inactive user
    await User.create({
      ...user,
      isActivated: false,
    });
    // sent email to client to increate number of users
    emailProvider.sendUpgradeNotification(orgAdmin);
  } catch (error) {
    InfoLogger({}, "error", `Failed to add new user: ${JSON.stringify(error)}`);
    return {};
  }
};

exports.registerSuperAdmin = async (req, res, next) => {
  try {
    const userData = req.body;
    const { email } = userData;
    const config = getConfig();

    const registeredUser = await User.findOne({ email }).exec();
    if (registeredUser) {
      return res.status(400).json({
        message: 'Email is already registered"',
        success: false,
      });
    }
    const orgId = req.body.organization || config.prescientOrgId;

    const user = await new User({
      ...userData,
      organization: organization ? new ObjectId(organization) : new ObjectId(config.prescientOrgId),
      termsAcceptedDate: new Date(),
    }).save();
    const token = makeToken(email);

    const tokenRecord = new Token({
      token,
      email,
      isUsed: false,
      expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      organization: user?.organization,
    });
    await tokenRecord.save();

    if (user.isActivated === false) {
      emailProvider.sendEmailVerification(user, stripHtml(token));
    }
    res.status(httpStatus.CREATED);
    return res.status(200).json({
      status: "success",
      message: "User Registered successfully",
    });
  } catch (error) {
    return next(User.checkDuplicateEmail(error));
  }
};

exports.registerAdmin = async (req, res, next) => {
  try {
    const userData = req.body;
    const { email } = userData;
    const config = getConfig();

    const registeredUser = await User.findOne({ email }).exec();
    if (registeredUser) {
      return res.status(400).json({
        message: 'Email is already registered"',
        success: false,
      });
    }

    // const user = await new User({
    //   ...userData,
    //   organization: new ObjectId(config.prescientOrgId),
    // }).save();
    const user = await new User({
      ...userData,
      organization: organization ? new ObjectId(organization) : new ObjectId(config.prescientOrgId),
      termsAcceptedDate: new Date(),
    }).save();
    const token = makeToken(email);

    const tokenRecord = new Token({
      token,
      email,
      isUsed: false,
      expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      organization: user?.organization,
    });
    await tokenRecord.save();

    if (user.isActivated === false) {
      emailProvider.sendEmailVerification(user, stripHtml(token));
    }
    res.status(httpStatus.CREATED);
    return res.status(200).json({
      status: "success",
      message: "User Registered successfully",
    });
  } catch (error) {
    return next(User.checkDuplicateEmail(error));
  }
};

exports.addBulkUsers = async (req, res, next) => {
  try {
    const { users, organization } = req.body;

    const emailList = users.map((user) => user.email);

    const existingUsers = await User.find({ email: { $in: emailList } }).exec();

    if (existingUsers.length > 0) {
      const existingEmails = existingUsers.map((user) => user.email);
      console.error("Error: Emails are already registered", existingEmails);
      return res.status(500).json({
        message: `Error: Emails are already registered  ${existingEmails}`,
      });
    }

    const usersToInsert = users.map(
      (userData) =>
        new User({
          ...userData,
          organization,
        })
    );

    const insertedUsers = await User.insertMany(usersToInsert);

    const results = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const user of insertedUsers) {
      const { email, organization } = user;
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization,
      });
      // eslint-disable-next-line no-await-in-loop
      await tokenRecord.save();
      emailProvider.sendEmailVerification(user, stripHtml(token));

      results.push({
        email,
        status: "success",
        message: "User registered successfully",
      });
    }

    res.status(200).json({ message: "Bulk registration successful" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
//SUPER ADMIN CONTROLLER
exports.activateUserStatus = async (req, res, next) => {
  try {
    const userData = req.body;
    // const organization = req?.user?.organization
    const { email, isChecked } = userData;
    const registeredUser = await User.findOne({
      email: email?.toLowerCase(),
      // organization: new ObjectId(organization)
    }).exec();

    if (!registeredUser) {
      return res.status(400).json({
        message: "User not found",
        success: false,
      });
    }

    const userTransformed = registeredUser.transform();
    if (isChecked) {
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization: registeredUser?.organization,
      });
      await tokenRecord.save();
      emailProvider.sendEmailVerification(userTransformed, token);
      ReqLogger(req, "info", "Activation Link Send");
      return res.status(200).json({
        status: "success",
        message: "User Activation Email send successfully",
        token,
        user: userTransformed,
      });
    } else {
      registeredUser.isActivated = isChecked;
      await registeredUser.save();
      ReqLogger(req, "info", "User Disabled");
      return res.status(200).json({
        status: "success",
        message: "User disabled successfully",
        user: userTransformed,
      });
    }
  } catch (error) {
    ReqLogger(req, "error", "Error sending activation link");
    return next(error);
  }
};

exports.setPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    const tokenData = await Token.findOne({
      token,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenData) {
      return res.status(400).json({ message: "Invalid or expired link. Please register again." });
    }

    const user = await User.findOne({ email: tokenData.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    user.password = password;
    user.isActivated = true;
    await user.save();

    tokenData.isUsed = true;
    await tokenData.save();

    const { accessToken, userContext } = await User.findAndGenerateToken({
      email: user.email,
      organization: tokenData.organization
    });

    const jwtResponse = generateTokenResponse(user, accessToken);

    res.cookie("userContext", userContext.randomString, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 14400000,
    });

    let organizationName = null;
    if (user.organization && user.userType !== 'non-organization') {
      const org = await Organization.findById(user.organization);
      organizationName = org?.name;
    }

    const verifiedUser = { ...user.transform(), organizationName };

    return res.json({
      status: "success",
      message: "Password set successfully! You are now logged in.",
      token: jwtResponse,
      user: verifiedUser,
    });

  } catch (error) {
    next(error);
  }
};

exports.activateUser = async (req, res, next) => {
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
    const existignUser = await User.findOne({
      email,
      organization: tokenData?.organization,
    }).exec();

    if (!existignUser) {
      console.log("User not found");
      return res.status(400).json({
        message: "Invalid Email Address. Please enter a valid email address!",
        success: false,
      });
    }
    existignUser.isActivated = true;
    await existignUser.save();

    console.log(existignUser);

    return res.status(200).json({
      status: "success",
      message:
        "Congratulations! You've successfully verified your email and activated your account.",
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyRecaptcha = async (req, res, next) => {
  const clientRecaptchaResponse = req.body.recaptchaValue;
  const config = getConfig();
  try {
    const verificationResponse = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      {},
      {
        params: {
          secret: config.recaptchaSecret,
          response: clientRecaptchaResponse,
        },
      }
    );

    const verificationResult = verificationResponse.data;

    if (verificationResult.success) {
      // reCAPTCHA was completed successfully
      res.json({ success: true, message: "reCAPTCHA verification passed" });
    } else {
      res.json({ success: false, message: "Please verify the captcha." });
    }
  } catch (error) {
    console.error("Failed to verify reCAPTCHA", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
/**
 * Returns jwt token if valid username and password is provided
 * @public
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password, organization } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "failed",
        message: "Email and password are required",
      });
    }

    const mongoose = require('mongoose');
    const config = getConfig();

    let query = { email: email.toLowerCase() };

    if (organization) {
      query.organization = mongoose.Types.ObjectId(organization);
    } else {
      query.organization = {
        $in: [
          null,
          mongoose.Types.ObjectId(config.prescientOrgId)
        ]
      };
    }

    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({
        status: "failed",
        message: "Invalid email or password",
      });
    }

    const isMatch = await user.passwordMatches(password);
    if (!isMatch) {
      return res.status(401).json({
        status: "failed",
        message: "Invalid email or password",
      });
    }

    if (!user.isActivated) {
      return res.status(401).json({
        status: "failed",
        message: "Please set your password first using the link sent to your email.",
      });
    }

    const { accessToken, userContext } = await User.findAndGenerateToken({
      email: user.email,
      organization: user.organization,
    });

    const tokenResponse = generateTokenResponse(user, accessToken);

    user.lastLogin = new Date();
    await user.save();
    res.cookie("userContext", userContext.randomString, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 14400000,
    });

    let organizationName = null;
    if (user.organization && user.userType !== 'non-organization') {
      const org = await Organization.findById(user.organization);
      organizationName = org?.name;
    }

    const verifiedUser = { ...user.transform(), organizationName };

    return res.json({
      status: "success",
      message: "Login successful",
      token: tokenResponse,
      user: verifiedUser,
    });
  } catch (error) {
    console.error("Login error:", error);
    return next(error);
  }
};

exports.loginVerification = async (req, res, next) => {
  try {
    const userData = req.body;
    const { email, organization, recaptchaValue } = userData;
    console.log(email, "<=== email");
    const config = getConfig();

    const existingUser = await User.findOne({
      email: email?.toLowerCase(),
    }).exec();
    console.log("<== Users:", await User.countDocuments());
    console.log(existingUser);
    // const verificationResponse = await axios.post(
    //   "https://www.google.com/recaptcha/api/siteverify",
    //   {},
    //   {
    //     params: {
    //       secret: config.recaptchaSecret,
    //       response: recaptchaValue,
    //     },
    //   }
    // );

    // const verificationResult = verificationResponse.data;
    // if (
    //   existingUser.organization?.toString() !== organization &&
    //   existingUser.role !== "organization"
    // ) {
    //   return res.status(400).json({
    //     message: "Your account has not been registered.",
    //   });
    // }
    if (!existingUser) {
      console.log("User not found");
      return res.status(400).json({
        message: "Your account has not been registered.",
      });
    }

    let existingOrganization = null;
    let trialInfo = null;
    if (existingUser.userType !== 'non-organization' && existingUser.organization) {
      existingOrganization = await Organization.findOne({
        _id: existingUser.organization,
      }).exec();
      console.log("existingOrganization-------------->", existingOrganization);

      if (existingOrganization) {
        if (
          existingOrganization.planType === "freemium" &&
          existingOrganization.isFreeTrialExpired() &&
          !existingOrganization.isRestricted
        ) {
          await existingOrganization.restrictAccount();
          await existingOrganization.save();
        }
        trialInfo = existingOrganization.planType === "freemium"
          ? {
              freeTrialEndDate: existingOrganization.freeTrialEndDate,
              daysRemaining: Math.max(
                0,
                Math.ceil(
                  (new Date(existingOrganization.freeTrialEndDate) - new Date()) /
                    (1000 * 60 * 60 * 24)
                )
              ),
              isRestricted: existingOrganization.isRestricted,
            }
          : null;
      } else {
        console.log("No organization found for user. Proceeding without organization data.");
      }
    } else {
      console.log("User is non-organization type. Skipping organization checks.");
    }

    const { isActivated, inviteKey, isInviteAccepted } = existingUser;

    if (inviteKey && !isInviteAccepted) {
      return res.status(400).json({
        message:
          "Your account has not been activated. Please check your email for the activation link.",
      });
    }

    if (!isActivated) {
      const tokenData = await Token.findOne({
        email: email,
        isUsed: false,
        organization: existingUser.organization || null,
      });
      console.log("tokendATA---------->", tokenData);
      if (tokenData) {
        tokenData.isUsed = true;
        await tokenData.save();
      }

      console.log("tokendATA---------->", tokenData);
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization: existingUser.organization || null,
      });
      await tokenRecord.save();
      emailProvider.sendEmailVerification(existingUser, token); // Activation email
      return res.status(400).json({
        message:
          "Your account has not been activated. Please check your email for the activation link.",
      });
    }

    const token = makeToken(email);
    // const verificationUrl = `${config?.clientURL}/verify-login/?auth=${token}`; // Raw URL
    emailProvider.sendVerifyLogin(existingUser, token); // Login verification
    const tokenRecord = new Token({
      token,
      email,
      isUsed: false,
      expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      organization: existingUser.organization || null,
    });
    await tokenRecord.save();

    return res.status(200).json({
      status: "success",
      trialInfo: trialInfo,
      message:
        "A magic link has been sent to your email address, if it exists in our system",
    });
    // if (verificationResult.success) {
    //   if (!existingUser) {
    //     console.log("User not found");
    //     return res.status(400).json({
    //       message: "Your account has not been registered.",
    //     });
    //   }

    //   const existingOrganization = await Organization.findOne({
    //     _id: existingUser.organization,
    //   }).exec();

    //   console.log("existingOrganization-------------->", existingOrganization);

    //   if (
    //     existingOrganization.planType === "freemium" &&
    //     existingOrganization.isFreeTrialExpired() &&
    //     !existingOrganization.isRestricted
    //   ) {
    //     await existingOrganization.restrictAccount();
    //   }

    //   await existingOrganization.save();

    //   console.log("existingOrganization-------------->", existingOrganization);

    //   // Check if free trial has expired and restrict access
    //   const trialInfo =
    //     existingOrganization.planType === "freemium"
    //       ? {
    //           freeTrialEndDate: existingOrganization.freeTrialEndDate,
    //           daysRemaining: Math.max(
    //             0,
    //             Math.ceil(
    //               (new Date(existingOrganization.freeTrialEndDate) -
    //                 new Date()) /
    //                 (1000 * 60 * 60 * 24)
    //             )
    //           ),
    //           isRestricted: existingOrganization.isRestricted,
    //         }
    //       : null;

    //   const { isActivated, inviteKey, isInviteAccepted, organization } =
    //     existingUser;

    //   if (inviteKey && !isInviteAccepted) {
    //     return res.status(400).json({
    //       message:
    //         "Your account has not been activated. Please check your email for the activation link.",
    //     });
    //   }

    //   if (!isActivated) {
    //     const tokenData = await Token.findOne({
    //       email: email,
    //       isUsed: false,
    //       organization: new ObjectId(organization),
    //     });
    //     console.log("tokendATA---------->", tokenData);
    //     if (tokenData) {
    //       tokenData.isUsed = true;
    //       await tokenData.save();
    //     }

    //     console.log("tokendATA---------->", tokenData);
    //     const token = makeToken(email);
    //     const tokenRecord = new Token({
    //       token,
    //       email,
    //       isUsed: false,
    //       expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
    //       organization: new ObjectId(organization),
    //     });
    //     await tokenRecord.save();
    //     emailProvider.sendEmailVerification(existingUser, token);
    //     return res.status(400).json({
    //       message:
    //         "Your account has not been activated. Please check your email for the activation link.",
    //     });
    //   }

    //   const token = makeToken(email);
    //   emailProvider.sendVerifyLogin(existingUser, token);
    //   const tokenRecord = new Token({
    //     token,
    //     email,
    //     isUsed: false,
    //     expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
    //     organization: new ObjectId(organization),
    //   });
    //   await tokenRecord.save();

    //   return res.status(200).json({
    //     status: "success",
    //     trialInfo: trialInfo,
    //     message:
    //       "A magic link has been sent to your email address, if it exists in our system",
    //   });
    // } else {
    //   res
    //     .status(400)
    //     .json({ success: false, message: "Please verify the captcha." });
    // }
  } catch (error) {
    console.log("ERROR in loginVerification:", error.message);
    return next(error);
  }
};

exports.loginOrganizationVerification = async (req, res, next) => {
  try {
    const userData = req.body;
    const { email, organization, recaptchaValue } = userData;
    const config = getConfig();

    const existingUser = await User.findOne({
      email,
      organization: organization,
    }).exec();

    // const verificationResponse = await axios.post(
    //   "https://www.google.com/recaptcha/api/siteverify",
    //   {},
    //   {
    //     params: {
    //       secret: config.recaptchaSecret,
    //       response: recaptchaValue,
    //     },
    //   }
    // );

    // const verificationResult = verificationResponse.data;

    // if (verificationResult.success) {
    //   if (!existingUser) {
    //     console.log("User not found");
    //     return res.status(200).json({
    //       message:
    //         "A magic link has been sent to your email address, if it exists in our system",
    //     });
    //   }

    //   const { isActivated, inviteKey, isInviteAccepted, organization } =
    //     existingUser;

    //   if (inviteKey && !isInviteAccepted) {
    //     return res.status(400).json({
    //       message:
    //         "Your account has not been activated. Please check your email for the activation link.",
    //     });
    //   }

    //   if (!isActivated) {
    //     const tokenData = await Token.findOne({
    //       email: email,
    //       isUsed: false,
    //       organization: new ObjectId(organization),
    //     });
    //     console.log("tokendATA---------->", tokenData);
    //     if (tokenData) {
    //       tokenData.isUsed = true;
    //       await tokenData.save();
    //     }

    //     console.log("tokendATA---------->", tokenData);
    //     const token = makeToken(email);
    //     const tokenRecord = new Token({
    //       token,
    //       email,
    //       isUsed: false,
    //       expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
    //       organization: new ObjectId(organization),
    //     });
    //     await tokenRecord.save();
    //     emailProvider.sendEmailVerification(existingUser, token);
    //     return res.status(400).json({
    //       message:
    //         "Your account has not been activated. Please check your email for the activation link.",
    //     });
    //   }

    //   const token = makeToken(email);
    //   emailProvider.sendVerifyLogin(existingUser, token);
    //   const tokenRecord = new Token({
    //     token,
    //     email,
    //     isUsed: false,
    //     expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
    //     organization: new ObjectId(organization),
    //   });
    //   await tokenRecord.save();

    //   return res.status(200).json({
    //     status: "success",
    //     message:
    //       "A magic link has been sent to your email address, if it exists in our system",
    //   });
    // } else {
    //   res
    //     .status(400)
    //     .json({ success: false, message: "Please verify the captcha." });
    // }
    if (!existingUser) {
      console.log("User not found");
      return res.status(200).json({
        message:
          "A magic link has been sent to your email address, if it exists in our system",
      });
    }

    const { isActivated, inviteKey, isInviteAccepted } = existingUser;

    if (inviteKey && !isInviteAccepted) {
      return res.status(400).json({
        message:
          "Your account has not been activated. Please check your email for the activation link.",
      });
    }

    if (!isActivated) {
      const tokenData = await Token.findOne({
        email: email,
        isUsed: false,
        organization: existingUser.organization, // Use the user's actual organization
      });
      console.log("tokendATA---------->", tokenData);
      if (tokenData) {
        tokenData.isUsed = true;
        await tokenData.save();
      }

      console.log("tokendATA---------->", tokenData);
      const token = makeToken(email);
      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization: existingUser.organization, // Use the user's actual organization
      });
      await tokenRecord.save();
      emailProvider.sendEmailVerification(existingUser, token);
      return res.status(400).json({
        message:
          "Your account has not been activated. Please check your email for the activation link.",
      });
    }

    const token = makeToken(email);
    emailProvider.sendVerifyLogin(existingUser, token);
    const tokenRecord = new Token({
      token,
      email,
      isUsed: false,
      expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
      organization: existingUser.organization, // Use the user's actual organization
    });
    await tokenRecord.save();

    return res.status(200).json({
      status: "success",
      message:
        "A magic link has been sent to your email address, if it exists in our system",
    });
  } catch (error) {
    return next(error);
  }
};

exports.loginWithGoogle = async (req, res, next) => {
  try {
    const { token } = req.body;
    const config = getConfig();
    if (!token) {
      res.status(403);
      res.send("Can't verify user.");
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
    console.log(decoded);
    const { email } = decoded;
    const body = {
      email,
      organization: tokenData?.organization,
    };
    const { user, accessToken, userContext } = await User.findAndGenerateToken(
      body
    );

    if (user?.inviteKey && !user?.isInviteAccepted) {
      return res.status(401).json({
        message:
          "Your account has not been activated. Please check your email for the activation link.",
      });
    }
    const newToken = generateTokenResponse(user, accessToken);

    const userTransformed = user.transform();
    emailProvider.sendLogin(user);
    // res.cookie("userContext", userContext.randomString, {
    //   httpOnly: true,
    //   domain: process.env.NODE_ENV === "production" ? "wai-partner-portal.fintra.ai" : undefined,  // Local pe no domain
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "lax",
    //   maxAge: 14400000,
    // });
    res.cookie("userContext", userContext.randomString, {
      httpOnly: true,
      secure: true,
      sameSite: "none", // Required for cross-origin
      maxAge: 14400000,
    });

    return res.status(200).json({
      status: "success",
      message: "User login successfully",
      token: newToken,
      user: userTransformed,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateUserRole = async (req, res, next) => {
  const { email, newRole } = req.body;

  // Validate new role
  if (!User.roles.includes(newRole)) {
    return next(
      new APIError({
        message: "Invalid role",
        status: httpStatus.BAD_REQUEST,
        isPublic: true,
      })
    );
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return next(
        new APIError({
          message: "User not found",
          status: httpStatus.NOT_FOUND,
          isPublic: true,
        })
      );
    }

    user.role = newRole;
    await user.save();

    return res.status(httpStatus.OK).json({
      message: "User role updated successfully",
      user: user.transform(),
    });
  } catch (error) {
    return next(error);
  }
};

exports.acceptCookies = async (req, res, next) => {
  res.cookie("cookieConsent", "accepted", {
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return res.json({ status: "Accepted" });
};

exports.declineCookies = async (req, res, next) => {
  res.cookie("cookieConsent", "declined", {
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return res.json({ status: "Declined" });
};

/**
 * Returns a new jwt when given a valid refresh token
 * @public
 */
exports.refresh = async (req, res, next) => {
  try {
    const { email, refreshToken } = req.body;
    const refreshObject = await RefreshToken.findOneAndRemove({
      userEmail: email,
      token: refreshToken,
    });
    const { user, accessToken } = await User.findAndGenerateToken({
      email,
      refreshObject,
    });
    const response = generateTokenResponse(user, accessToken);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
};

exports.acceptSaasAgreement = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      throw new APIError({
        message: "Authentication required",
        status: httpStatus.UNAUTHORIZED,
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new APIError({
        message: "User not found",
        status: httpStatus.NOT_FOUND,
      });
    }

    user.hasAcceptedSaasAgreement = true;
    user.saasTermsAcceptedDate = new Date();

    await user.save();

    return res.status(httpStatus.OK).json({
      success: true,
      message: "SaaS agreement accepted successfully",
      user: user.transform(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get SaaS agreement status
 * @public
 */
exports.getSaasAgreementStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      throw new APIError({
        message: "Authentication required",
        status: httpStatus.UNAUTHORIZED,
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new APIError({
        message: "User not found",
        status: httpStatus.NOT_FOUND,
      });
    }

    return res.status(httpStatus.OK).json({
      success: true,
      hasAcceptedSaasAgreement: user.hasAcceptedSaasAgreement,
      termsAcceptedDate: user.termsAcceptedDate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manual token cleanup endpoint for administrators
 */
exports.cleanupTokens = async (req, res, next) => {
  try {
    const { manualCleanup } = require("../utils/tokenCleanup");
    const deletedCount = await manualCleanup();

    return res.status(httpStatus.OK).json({
      success: true,
      message: `Successfully cleaned up ${deletedCount} expired/used tokens`,
      deletedCount,
    });
  } catch (error) {
    console.error("Manual token cleanup failed:", error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to cleanup tokens",
      error: error.message,
    });
  }
};
