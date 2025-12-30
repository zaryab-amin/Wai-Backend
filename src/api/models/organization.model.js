/* eslint-disable quotes */
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const httpStatus = require("http-status");
const { omitBy, isNil } = require("lodash");
const bcrypt = require("bcryptjs");
const moment = require("moment-timezone");
const jwt = require("jwt-simple");
const uuidv4 = require("uuid/v4");
const crypto = require("crypto");
const APIError = require("../errors/api-error");
const { getConfig } = require("../../config/vars");

/**
 * Organization Schema
 * @private
 */
const organizationSchema = new mongoose.Schema(
  {
    // Existing fields
    organizationId: {
      type: String,
      unique: true,
      maxLength: 64,
      trim: true,
      required: true,
    },
    organizationLogo: {
      type: String,
      default: null,
    },
    signatoryUser: {
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      maxlength: 128,
      unique: true,
      index: true,
      trim: true,
    },
    role: {
      type: String,
      default: "organization",
    },
    phoneNumber: {
      type: String,
    },
    website: {
      type: String,
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    sessionId: {
      type: String,
      default: null,
    },
    subscriptionId: {
      type: String,
      default: null,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "canceled", "past_due", "unpaid"],
      default: "inactive",
    },
    // New field to track account plan type
    planType: {
      type: String,
      enum: ["freemium", "premium"],
      default: "freemium",
    },
    // New field to track if a freemium account has been restricted
    isRestricted: {
      type: Boolean,
      default: false,
    },
    // Keeping track of when the free trial expires
    freeTrialEndDate: {
      type: Date,
      default: null,
    },
    numberOfUsers: {
      type: Number,
      default: 3,
    },
    billingCycleStartDate: {
      type: Date,
      default: Date.now,
    },
    billingCycleEndDate: {
      type: Date,
      default: null,
    },
    pendingSubscriptionUpdate: {
      checkoutSessionId: { type: String },
      newUserCount: { type: Number },
      previousUserCount: { type: Number },
      subscriptionId: { type: String },
      invoiceId: { type: String },
      paymentIntentId: { type: String },
      updateDate: { type: Date },
      prorationDetails: {
        daysRemaining: { type: Number },
        currentMonthlyRate: { type: Number },
        newMonthlyRate: { type: Number },
        proratedAmount: { type: Number },
      },
    },
    stripeAccountId: {
      type: String,
      sparse: true,
    },
    stripePublishableKey: {
      type: String,
      select: true,
    },
    stripeSecretKey: {
      type: String,
      select: true,
    },
    stripeAccountStatus: {
      type: String,
      enum: ["pending", "active", "rejected", "restricted"],
      default: "pending",
    },
    stripeAccountDetails: {
      chargesEnabled: {
        type: Boolean,
        default: false,
      },
      payoutsEnabled: {
        type: Boolean,
        default: false,
      },
      detailsSubmitted: {
        type: Boolean,
        default: false,
      },
      currency: {
        type: String,
        default: "usd",
      },
    },
    stripeBankAccount: {
      last4: String,
      bankName: String,
      accountHolderName: String,
      accountType: String,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Methods
 */
organizationSchema.method({
  transform() {
    const transformed = {};
    const fields = [
      "id",
      "name",
      "organizationLogo",
      "signatoryUser",
      "role",
      "phoneNumber",
      "address",
      "country",
      "organizationId",
      "createdAt",
      "planType", // Include plan type in transformation
      "freeTrialEndDate", // Include free trial end date
      "isRestricted", // Include restriction status
    ];

    fields.forEach((field) => {
      transformed[field] = this[field];
    });

    return transformed;
  },

  generateUserContext() {
    const randomString = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash("sha256").update(randomString).digest("hex");
    return { randomString, hash };
  },

  token(userContexthash, organization) {
    const config = getConfig();
    const payload = {
      exp: moment().add(
        isNaN(Number(config?.jwtExpirationInterval)) ?
          3600 :
          Number(config?.jwtExpirationInterval),
        "minutes"
      ).unix(),
      iat: moment().unix(),
      sub: this._id,
      userContext: userContexthash,
      organization,
    };
    return jwt.encode(payload, config.jwtSecret);
  },

  async passwordMatches(password) {
    return bcrypt.compare(password, this.password);
  },

  // New method to check if free account is beyond 30-day period
  isFreeTrialExpired() {
    if (this.planType !== "freemium") {
      return false;
    }

    return moment().isAfter(this.freeTrialEndDate);
  },

  // New method to check if organization should be allowed access
  isAccessAllowed() {
    // Premium accounts always have access
    if (this.planType === "premium") {
      return true;
    }

    // Free accounts are allowed access if within 30-day trial period
    // or if they're not yet restricted (this allows for grace periods if needed)
    return !this.isFreeTrialExpired() || !this.isRestricted;
  },

  // Method to upgrade to premium
  upgradeToPremium() {
    this.planType = "premium";
    this.isRestricted = false;
    return this.save();
  },

  // Method to restrict account
  restrictAccount() {
    if (this.planType === "freemium" && this.isFreeTrialExpired()) {
      this.isRestricted = true;
      return this.save();
    }
    return this;
  },
});

/**
 * Statics
 */
organizationSchema.statics = {
  /**
   * Get organization
   *
   * @param {ObjectId} id - The objectId of organization.
   * @returns {Promise<organization, APIError>}
   */
  async get(id) {
    let organization;

    if (mongoose.Types.ObjectId.isValid(id)) {
      organization = await this.findById(id).exec();
    }
    if (organization) {
      return organization;
    }

    throw new APIError({
      message: "organization does not exist",
      status: httpStatus.NOT_FOUND,
    });
  },

  /**
   * Find organization by email and tries to generate a JWT token
   *
   * @param {ObjectId} id - The objectId of organization.
   * @returns {Promise<organization, APIError>}
   */
  async findAndGenerateToken(options) {
    const {
      email,
      organization: organizationId,
      password,
      refreshObject,
    } = options;
    if (!email) {
      throw new APIError({
        message: "An email is required to generate a token",
      });
    }

    console.log("email", email);
    const organization = await this.findOne({
      email,
      _id: new ObjectId(organizationId),
    }).exec();
    console.log("organization", organization);
    const err = {
      status: httpStatus.UNAUTHORIZED,
      isPublic: true,
    };

    if (organization) {
      // Check if free account is restricted
      if (
        organization.planType === "freemium" &&
        organization.isFreeTrialExpired()
      ) {
        // Update restriction status
        await organization.restrictAccount();

        if (organization.isRestricted) {
          err.message =
            "Your free trial has expired. Please upgrade to premium to continue using the service.";
          throw new APIError(err);
        }
      }

      const userContext = organization.generateUserContext();
      console.log("organization here------------------>", organization);
      return {
        userContext,
        organization,
        accessToken: organization.token(userContext.hash, organization),
      };
    }

    err.message = "Incorrect email";
    throw new APIError(err);
  },

  /**
   * List organization in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of organization to be skipped.
   * @param {number} limit - Limit number of organization to be returned.
   * @returns {Promise<organization[]>}
   */
  list({ page = 1, perPage = 30, name, email, planType }) {
    const options = omitBy({ name, email, role, planType }, isNil);

    return this.find(options)
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },

  /**
   * Return new validation error
   * if error is a mongoose duplicate key error
   *
   * @param {Error} error
   * @returns {Error|APIError}
   */
  checkDuplicateEmail(error) {
    if (error.name === "MongoError" && error.code === 11000) {
      return new APIError({
        message: "Validation Error",
        errors: [
          {
            field: "email",
            location: "body",
            messages: ['"email" already exists'],
          },
        ],
        status: httpStatus.CONFLICT,
        isPublic: true,
        stack: error.stack,
      });
    }
    return error;
  },

  /**
   * Check and restrict expired free trial accounts
   * This can be run as a scheduled job
   */
  async restrictExpiredFreeTrials() {
    const expiredFreeAccounts = await this.find({
      planType: "freemium",
      isRestricted: false,
      freeTrialEndDate: { $lt: new Date() },
    });

    const restrictionPromises = expiredFreeAccounts.map((org) =>
      org.restrictAccount()
    );
    return Promise.all(restrictionPromises);
  },

  /**
   * Update account when subscription is purchased
   */
  async upgradeOnSubscription(organizationId) {
    const organization = await this.findById(organizationId);
    if (organization) {
      organization.planType = "premium";
      organization.isRestricted = false;
      return organization.save();
    }
    return null;
  },
};

/**
 * Middleware to automatically update planType when subscription status changes
 */
organizationSchema.pre("save", function (next) {
  // When subscription becomes active, upgrade to premium
  if (
    this.isModified("subscriptionStatus") &&
    this.subscriptionStatus === "active"
  ) {
    this.planType = "premium";
    this.isRestricted = false;
  }

  // If subscription is canceled/inactive and planType is premium, revert to freemium
  // and set freeTrialEndDate to current date (immediately expired)
  if (
    this.isModified("subscriptionStatus") &&
    (this.subscriptionStatus === "canceled" ||
      this.subscriptionStatus === "inactive") &&
    this.planType === "premium"
  ) {
    this.planType = "freemium";
    this.freeTrialEndDate = new Date(Date.now() - 1); // Set to past date
    this.isRestricted = true;
  }

  next();
});

/**
 * @typedef Organization
 */
module.exports = mongoose.model("Organization", organizationSchema);
