/* eslint-disable quotes */
const httpStatus = require("http-status");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const APIError = require("../errors/api-error");
const { getConfig } = require("../../config/vars");

const ADMIN = "admin";
const ORGANIZATION_ADMIN = "organization";
const SUPER_ADMIN = "super-admin";
const LOGGED_USER = "user";

const handleJWT = (req, res, next, roles) => async (err, user, info) => {
  const context = req.cookies.userContext;
  let organization = null;
  const config = getConfig();
  try {
    // Check if Authorization header exists
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      throw new Error("No Authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");

    // Check if JWT secret is configured
    if (!config.jwtSecret) {
      console.error("CRITICAL: JWT_SECRET is not configured in environment variables!");
      throw new Error("Server configuration error");
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwtSecret, {
      ignoreExpiration: false,
    });
    organization = decoded.organization;
    console.log("organization: ", organization);
    const jwtUserContext = decoded.userContext;

    // Only enforce cookie <-> token binding if the cookie is actually present.
    // This avoids false 401/403s in environments where the cookie might not be sent
    // (e.g. some cross-site or CORS edge cases), while still allowing header-based JWT auth.
    if (context && jwtUserContext) {
      const auth = crypto.createHash("sha256").update(context).digest("hex");

    if (jwtUserContext !== auth) {
      console.log("Cookie token mismatch detected");
      const apiError = new APIError({
        status: httpStatus.FORBIDDEN,
        message: "CookieTokenMismatch",
      });
      return next(apiError);
    }
    }
  } catch (error) {
    console.log(`Authentication error: ${error.message}`);
    const apiError = new APIError({
      message: error ? error.message : "Unauthorized",
      status: httpStatus.UNAUTHORIZED,
      stack: config.env === "development" ? error.stack : undefined,
    });
    return next(apiError);
  }
  req.user = user;

  const error = err || info;
  const logIn = Promise.promisify(req.logIn);
  const apiError = new APIError({
    message: error ? error.message : "Unauthorized",
    status: httpStatus.UNAUTHORIZED,
    stack: config.env === "development" ? error.stack : undefined,
  });

  if (organization === undefined) {
    try {
      if (error || !user) throw error;
      await logIn(user, { session: false });
    } catch (e) {
      return next(apiError);
    }
  }

  if (roles === LOGGED_USER) {
    if (user.role !== "admin" && req.params.userId !== user._id.toString()) {
      apiError.status = httpStatus.FORBIDDEN;
      apiError.message = "Forbidden";
      return next(apiError);
    }
    if (roles === SUPER_ADMIN && user.role !== SUPER_ADMIN) {
      apiError.status = httpStatus.FORBIDDEN;
      apiError.message = "Forbidden Role";
      return next(apiError);
    }
  } else if (!roles.includes(user.role)) {
    apiError.status = httpStatus.FORBIDDEN;
    apiError.message = "Forbidden";
    return next(apiError);
  }

  return next();
};

exports.ADMIN = ADMIN;
exports.LOGGED_USER = LOGGED_USER;
exports.SUPER_ADMIN = SUPER_ADMIN;
exports.ORGANIZATION_ADMIN = ORGANIZATION_ADMIN;

exports.authorize = (roles = User.roles) => (req, res, next) => passport.authenticate(
  "jwt",
  { session: false },
  handleJWT(req, res, next, roles),
)(req, res, next);
