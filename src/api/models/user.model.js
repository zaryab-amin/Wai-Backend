/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isNil } = require("lodash");
const bcrypt = require("bcryptjs");
const moment = require("moment-timezone");
const jwt = require("jwt-simple");
const crypto = require("crypto");
const APIError = require("../errors/api-error");
const { ObjectId } = require("mongodb");
const { getConfig } = require("../../config/vars");

/**
 * User Roles
 */
const roles = ["user", "admin", "super-admin", "organization"];

/**
 * User Schema
 * @private
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      match: /^\S+@\S+\.\S+$/,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      maxlength: 100,
      index: true,
      trim: true,
    },
    role: {
      type: String,
      enum: roles,
      default: "user",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    isActivated: {
      type: Boolean,
      default: false,
    },
    accessToken: String,
    userType: {
      type: String,
      enum: ["organization", "non-organization"],
      default: "non-organization",
    },
    hasAcceptedSaasAgreement: {
      type: Boolean,
      required: true,
      default: false,
    },
    saasTermsAcceptedDate: {
      type: Date,
      default: null,
    },
    hasAcceptedTerms: {
      type: Boolean,
      required: true,
      default: false,
    },
    hasAcceptedSaasAgreement: {
      type: Boolean,
      required: true,
      default: false,
    },
    saasTermsAcceptedDate: {
      type: Date,
      default: null,
    },
    termsAcceptedDate: {
      type: Date,
      default: null,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    isSignatoryUser: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: "",
    },
    isNotificationEnabled: {
      type: Boolean,
      default: false,
    },
    invitedBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isInviteAccepted: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: false,
      select: false,
    },
    inviteKey: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1, organization: 1 }, { unique: true });

// Auto-hash password before save
userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

/**
 * Methods
 */
userSchema.method({
  transform() {
    const transformed = {};
    const fields = [
      "id",
      "name",
      "email",
      "role",
      "userType",
      "lastLogin",
      "isActivated",
      "organization",
      "createdAt",
      "isNotificationEnabled",
      "avatar",
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
  token(userContexthash) {
    const config = getConfig();
    const payload = {
      organization: this.organization,
      exp: moment()
        .add(
          isNaN(Number(config?.jwtExpirationInterval))
            ? 3600
            : Number(config?.jwtExpirationInterval),
          "minutes"
        )
        .unix(),
      iat: moment().unix(),
      sub: this._id,
      userContext: userContexthash,
    };
    return jwt.encode(payload, config.jwtSecret);
  },

  async passwordMatches(password) {
    return bcrypt.compare(password, this.password);
  },
});

/**
 * Statics
 */
userSchema.statics = {
  roles,

  /**
   * Get user
   *
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  async get(id) {
    let user;

    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await this.findById(id).exec();
    }
    if (user) {
      return user;
    }

    throw new APIError({
      message: "User does not exist",
      status: httpStatus.NOT_FOUND,
    });
  },

  /**
   * Find user by email and tries to generate a JWT token
   *
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  async findAndGenerateToken(options) {
    const { email, organization } = options;
    console.log("findAndGenerateToken called with:", { email, organization });

    if (!email) {
      console.log("ERROR: No email provided");
      throw new APIError({
        message: "An email is required to generate a token",
        status: httpStatus.BAD_REQUEST,
      });
    }

    if (!organization) {
      console.log("ERROR: No organization provided");
      throw new APIError({
        message: "Organization is required to generate a token",
        status: httpStatus.BAD_REQUEST,
      });
    }

    try {
      const query = {
        email: email.toLowerCase(),
        organization: mongoose.Types.ObjectId.isValid(organization)
          ? mongoose.Types.ObjectId(organization)
          : organization,
      };
      console.log("Executing user query:", query);

      const user = await this.findOne(query).exec();

      console.log("User found in database:", user ? "Yes" : "No");
      if (user) {
        console.log("User details:", {
          id: user._id,
          email: user.email,
          organization: user.organization,
          isActivated: user.isActivated,
          role: user.role,
        });
      }

      if (!user) {
        console.log("ERROR: User not found for email and organization");
        throw new APIError({
          message: "User not found for this email and organization",
          status: httpStatus.NOT_FOUND,
          isPublic: true,
        });
      }

      if (!user.isActivated) {
        console.log("ERROR: User account is not activated");
        throw new APIError({
          message:
            "User account is not activated. Please check your email for activation link.",
          status: httpStatus.UNAUTHORIZED,
          isPublic: true,
        });
      }

      const userContext = user.generateUserContext();
      const accessToken = user.token(userContext.hash);

      console.log("Token generated successfully for user:", user.email);

      return {
        userContext,
        user,
        accessToken,
      };
    } catch (error) {
      console.log("ERROR in findAndGenerateToken:", error.message);
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError({
        message: "Failed to generate token",
        status: httpStatus.INTERNAL_SERVER_ERROR,
        isPublic: true,
      });
    }
  },

  /**
   * List users in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of users to be skipped.
   * @param {number} limit - Limit number of users to be returned.
   * @returns {Promise<User[]>}
   */
  list({ page = 1, perPage = 30, name, email, role = "user" }) {
    const options = omitBy({ name, email, role }, isNil);

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
            messages: ["Email already exists for this organization"],
          },
        ],
        status: httpStatus.CONFLICT,
        isPublic: true,
        stack: error.stack,
      });
    }
    return error;
  },
};

/**
 * @typedef User
 */
module.exports = mongoose.model("User", userSchema);
