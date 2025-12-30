const httpStatus = require("http-status");
const { omit } = require("lodash");
const moment = require("moment-timezone");
const RefreshToken = require("../models/refreshToken.model");
const User = require("../models/user.model");
const Organization = require("../models/organization.model");
const { getSignedUrlFile } = require("./gcs.controller");
const { userSchema } = require("../validations/user.validation");
const { generateId, isSuperAdminUser } = require("../utils");
const { ObjectId } = require("mongodb");
const { queryBuilder } = require("../utils/queryBuilder");
const emailProvider = require("../services/emails/emailProvider");
const NotificationRead = require("../models/notificationRead.model");
const { getConfig } = require("../../config/vars");

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
/**
 * Load user and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
  try {
    const user = await User.get(id);
    req.locals = { user };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get user
 * @public
 */
exports.get = async (req, res) => {
  try {
    const user = req.locals.user.transform();
    if (user?.avatar) {
      user.avatar = await getSignedUrlFile(user?.avatar);
    }
    const organization = await Organization.findOne({
      _id: user?.organization,
    });
    if (organization?.organizationLogo) {
      organization.organizationLogo = await getSignedUrlFile(
        organization?.organizationLogo
      );
    }

    const userId = user?._id;
    const notifications = await NotificationRead.countDocuments({
      adminId: new ObjectId(userId),
      readAt: null,
    }).exec();

    res.json({ ...user?.toObject(), organization, notifications });
  } catch (error) {
    next(error);
  }
};

/**
 * Get logged in user info
 * @public
 */
exports.loggedIn = async (req, res, next) => {
  try {
    const user = req.user;
    if (user?.avatar) {
      user.avatar = await getSignedUrlFile(user?.avatar);
    }
    const organization = await Organization.findOne({
      _id: user?.organization,
    });

    if (organization?.organizationLogo) {
      organization.organizationLogo = await getSignedUrlFile(
        organization?.organizationLogo
      );
    }

    const userId = user?._id;
    const notifications = await NotificationRead.countDocuments({
      adminId: new ObjectId(userId),
      readAt: null,
    }).exec();

    res.json({ ...user?.toObject(), organization, notifications });
  } catch (error) {
    next(error);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, category, userType } = req.query;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const filterQuery = queryBuilder([
      { type: "search", field: "name", value: search },
      { type: "search", field: "email", value: search },
      { type: "field", field: "isActivated", value: category },
    ]);

    const users = await User.aggregate([
      // Match the filter query
      {
        $match: {
          ...filterQuery,
          userType,
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },

      // Sort by createdAt
      { $sort: { createdAt: -1 } },

      // Paginate the results
      { $skip: (page - 1) * limit },
      { $limit: Number(limit) },

      // Lookup the number of purchases for each user
      {
        $lookup: {
          from: "purchases", // Purchase collection
          localField: "_id", // User's `_id`
          foreignField: "user", // Purchases' `user` field
          as: "purchases",
        },
      },

      {
        $lookup: {
          from: "purchasequizzes", // PurchaseQuiz collection
          localField: "_id", // User's `_id`
          foreignField: "user", // PurchaseQuiz's `user` field
          as: "purchaseQuizzes",
        },
      },

      {
        $addFields: {
          totalCourseCost: {
            $sum: "$purchases.amount", // Sum `amount` from purchases
          },
          totalQuizCost: {
            $sum: "$purchaseQuizzes.amount", // Sum `amount` from purchaseQuizzes
          },
          totalSpent: {
            $add: [
              { $sum: "$purchases.amount" }, // Add course costs
              { $sum: "$purchaseQuizzes.amount" }, // Add quiz costs
            ],
          },
        },
      },

      // Add a field to count the number of purchases
      {
        $addFields: {
          coursesPurchased: { $size: "$purchases" }, // Count purchases for each user
          quizzesPurchased: { $size: "$purchaseQuizzes" }, // Count quizzes purchased
        },
      },

      // Lookup the number of purchases for each user
      {
        $lookup: {
          from: "purchases", // Purchase collection
          localField: "_id", // User's `_id`
          foreignField: "user", // Purchases' `user` field
          as: "purchases",
        },
      },

      // Add a field to count the number of purchases
      {
        $addFields: {
          coursesPurchased: { $size: "$purchases" }, // Count purchases for each user
        },
      },

      // Optionally populate the `invitedBy` field
      {
        $lookup: {
          from: "users", // User collection
          localField: "invitedBy",
          foreignField: "_id",
          as: "invitedBy",
        },
      },
      {
        $unwind: {
          path: "$invitedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const totalCount = await User.countDocuments({
      ...filterQuery,
      userType,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    return res.status(200).json({
      success: true,
      users,
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

/**
 * Create new user
 * @public
 */
exports.create = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { name, email, role, userType } = req.body;
    await userSchema.validateAsync({
      name,
      email,
      role,
      userType,
    });

    const isUserExist = await User.findOne({
      email,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (isUserExist || isUserExist?.name) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = new User({
      name,
      email,
      role,
      userType,
      hasAcceptedTerms: false,
      organization,
    });

    const savedUser = await user.save();
    res.status(httpStatus.CREATED);
    res.json(savedUser.transform());
  } catch (error) {
    next(User.checkDuplicateEmail(error));
  }
};

exports.createInviteUser = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const config = getConfig();
    const { name, email, role, userType } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    await userSchema.validateAsync({
      name,
      email,
      role,
      userType,
    });

    const isUserExist = await User.findOne({
      email,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (isUserExist || isUserExist?.name) {
      return res
        .status(400)
        .json({ message: "A user with this email already exists" });
    }

    if (organization && organization?.toString() !== config.prescientOrgId) {
      const existingUsers = await User.find({ organization }).lean().exec();
      const existingOrganization = await Organization.findOne({
        _id: organization,
      }).populate("signatoryUser");

      const currentUsers = existingUsers.length;
      const { numberOfUsers } = existingOrganization;
      if (currentUsers > numberOfUsers - 1) {
        return res.status(400).json({
          message:
            "Your organization has reached the user limit. Please request an account upgrade.",
        });
      }
    }

    const user = new User({
      name,
      email,
      role,
      userType,
      hasAcceptedTerms: false,
      invitedBy: new ObjectId(userId),
      isInviteAccepted: false,
      organization,
      inviteKey: generateId(64),
    });

    await user.save();

    console.log("user---------->", user);
    emailProvider.sendInvitationLink(user);
    return res
      .status(200)
      .json({ message: "User invited successfully to the platform" });
  } catch (error) {
    return next(error);
  }
};

exports.getInviteUser = async (req, res, next) => {
  try {
    const { inviteKey } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const user = await User.findOne({
      inviteKey,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    return res
      .status(200)
      .json({ message: "Invited user fetched successfully", user });
  } catch (error) {
    return next(error);
  }
};

exports.resendInvite = async (req, res, next) => {
  try {
    const { userId, name, email, role, userType } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    await userSchema.validateAsync({
      name,
      email,
      role,
      userType,
    });

    const user = await User.findOne({
      _id: new ObjectId(userId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (user?.isInviteAccepted) {
      return res
        .status(400)
        .json({ message: "User already accepted the invite" });
    }

    user.inviteKey = generateId(64);

    await user.save();
    emailProvider.sendInvitationLink(user);
    return res.status(200).json({ message: "Invite resend successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.updateInviteUser = async (req, res, next) => {
  try {
    const { inviteKey } = req.params;

    const user = await User.findOne({ inviteKey }).exec();

    if (!user) {
      return res.status(400).json({ message: "Invite link expired" });
    }

    if (user?.isInviteAccepted) {
      return res
        .status(400)
        .json({ message: "User already accepted the invite" });
    }

    user.inviteKey = "";
    user.isInviteAccepted = true;
    user.isActivated = true;

    await user.save();

    const body = {
      email: user?.email,
      organization: user?.organization,
    };
    const {
      user: loggedInUser,
      accessToken,
      userContext,
    } = await User.findAndGenerateToken(body);
    const newToken = generateTokenResponse(loggedInUser, accessToken);

    const userTransformed = loggedInUser.transform();
    emailProvider.sendLogin(loggedInUser);
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
    return res.status(200).json({
      message: "Invite accepted successfully",
      token: newToken,
      user: userTransformed,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Replace existing user
 * @public
 */
exports.replace = async (req, res, next) => {
  try {
    const { user } = req.locals;
    const newUser = new User(req.body);
    const ommitRole = user.role !== "admin" ? "role" : "";
    const newUserObject = omit(newUser.toObject(), "_id", ommitRole);

    await user.updateOne(newUserObject, { override: true, upsert: true });
    const savedUser = await User.findById(user._id);

    res.json(savedUser.transform());
  } catch (error) {
    next(User.checkDuplicateEmail(error));
  }
};

/**
 * Update existing user
 * @public
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, email, role, userType } = req.body;
    const reqUserId = req?.user?._id;
    const reqRole = req?.user?.role;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    await userSchema.validateAsync({
      name,
      email,
      role,
      userType,
    });

    const user = await User.findOne({
      _id: new ObjectId(userId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!user) {
      return res.status(404).json({
        message: "User does not exists",
        success: false,
      });
    }
    if (user.email?.toLowerCase() !== email?.toLowerCase()) {
      const isEmailExist = await User.findOne({ email: email?.toLowerCase() });

      if (isEmailExist) {
        return res
          .status(400)
          .json({ message: "A user with this email already exists" });
      }
    }

    if (
      reqRole === "super-admin" &&
      user?.role === "super-admin" &&
      user?._id?.toString() !== reqUserId?.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to perform this action",
        success: false,
      });
    }

    user.name = name;
    user.email = email;
    user.userType = userType;
    user.role = role;

    await user.save();

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get user list
 * @public
 */
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search = "" } = req.query;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    let query = {};
    if (search) {
      query = {
        name: { $regex: "^" + search, $options: "i" },
        role: { $in: ["admin", "user"] },
      };
    }

    console.log("page: " + page);
    console.log("limit: " + limit);
    const users = await User.find({
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      ...query,
    })
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    const totalCount = await User.countDocuments({
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      role: { $in: ["admin", "user"] },
    });
    const transformedUsers = users.map((user) => user.transform());
    res.json({ data: transformedUsers, totalCount });
  } catch (error) {
    return next(error);
  }
};

/**
 * Delete user
 * @public
 */
exports.remove = (req, res, next) => {
  const { user } = req.locals;

  user
    .remove()
    .then(() => res.status(httpStatus.NO_CONTENT).end())
    .catch((e) => next(e));
};

exports.deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const reqRole = req?.user?.role;
    const reqUserId = req?.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!user) {
      return res.status(404).json({
        message: "User does not exists",
        success: false,
      });
    }
    if (user?.isSignatoryUser) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }
    if (
      user?.role === "super-admin" &&
      reqRole === "super-admin" &&
      reqUserId?.toString() !== user?._id?.toString()
    ) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }
    await User.deleteOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    return res.status(200).json({
      status: "success",
      message: "User deleted successfully",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
};

exports.getUserByOrganization = async (req, res, next) => {
  try {
    const { organizationId, page, limit } = req.query;
    console.log("organization", organizationId);
    const organization = await Organization.findOne({
      _id: organizationId,
    })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .exec();
    if (!organization) {
      return res.status(404).json({
        message: "Organization does not exists",
        success: false,
      });
    }
    const users = await User.find({ organization: organizationId })
      .sort({ createdAt: -1 })
      .exec();

    console.log(users);
    return res.status(200).json({
      status: "success",
      message: "User fetched successfully",
      users,
      totalCount: users && users.length ? users.length : 0,
    });
  } catch (error) {
    return next(error);
  }
};

exports.listOfClientsUsers = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const users = await User.find({
      role: "user",
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .sort({ createdAt: -1 })
      .exec();
    const transformedUsers = users.map((user) => user.transform());
    res.json({
      data: transformedUsers,
      totalCount: users && users.length ? users.length : 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateUserSettings = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { name, email } = req.body;

    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!user) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    user.name = name;
    user.email = email;
    // user.role = userRole;

    await user.save();

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleUserNotification = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { isNotificationEnabled } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!user) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    user.isNotificationEnabled = isNotificationEnabled;

    await user.save();

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleUserActiveStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { isActivated } = req.body;

    console.log("isActivated------------->", isActivated);
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const config = getConfig();

    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!user) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    if (user?.organization?.toString() !== config?.prescientOrgId) {
      const existingUsers = await User.find({
        organization,
        userType: "organization",
      })
        .lean()
        .exec();

      const existingOrganization = await Organization.findOne({
        _id: organization,
      });

      const currentUsers = existingUsers.length;
      const { numberOfUsers } = existingOrganization;

      if (currentUsers >= numberOfUsers - 1 && isActivated === true) {
        return res.status(400).json({
          message:
            "Your organization has reached the user limit. Please upgrade your user limit to continue.",
        });
      }
    }

    user.isActivated = isActivated;
    if (isActivated && user.inviteKey) {
      user.inviteKey = "";
      user.isInviteAccepted = true;
    }

    await user.save();

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.deactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    console.log("userId---------->", userId);

    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!user) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    // Only handle deactivation
    if (user.isActivated === false) {
      return res.status(400).json({
        message: "User is already inactive",
        success: false,
      });
    }

    user.isActivated = false;
    await user.save();

    console.log("user---------->", user);

    return res.status(200).json({
      status: "success",
      message: "User deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
};
