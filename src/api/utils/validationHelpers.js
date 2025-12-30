const User = require("../models/user.model");
const Organization = require("../models/organization.model");
const { ObjectId } = require("mongodb");
const { getConfig } = require("../../config/vars");

/**
 * Validate user status for login
 * @param {Object} user - User object
 * @param {Object} organization - Organization object
 * @returns {Object} Validation result
 */
const validateUserLoginStatus = async (user, organization) => {
  const config = getConfig();
  const errors = [];
  const warnings = [];

  // Check if user exists
  if (!user) {
    errors.push("User not found");
    return { isValid: false, errors, warnings };
  }

  // Check if user is activated
  if (!user.isActivated) {
    errors.push(
      "User account is not activated. Please check your email for the activation link."
    );
  }

  // Check invite status
  if (user.inviteKey && !user.isInviteAccepted) {
    errors.push("User has a pending invitation that needs to be accepted.");
  }

  // Check organization status
  if (user.organization && organization) {
    // Check if organization is active
    if (!organization.isActive) {
      errors.push("Organization account is not active.");
    }

    // Check trial status for non-Prescient organizations
    const isPrescientOrg =
      organization._id.toString() === config.prescientOrgId;

    if (!isPrescientOrg && organization.planType === "freemium") {
      if (organization.isFreeTrialExpired() && organization.isRestricted) {
        const isSignatoryUser =
          user.isSignatoryUser ||
          organization.signatoryUser.toString() === user._id.toString();

        if (!isSignatoryUser) {
          errors.push(
            "Organization free trial has expired. Only the organization admin can log in at this time."
          );
        } else {
          warnings.push(
            "Organization free trial has expired. Please upgrade your subscription."
          );
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate token data
 * @param {Object} tokenData - Token data from database
 * @returns {Object} Validation result
 */
const validateTokenData = (tokenData) => {
  const errors = [];
  const warnings = [];

  if (!tokenData) {
    errors.push("Token not found in database");
    return { isValid: false, errors, warnings };
  }

  if (tokenData.isUsed) {
    errors.push("Token has already been used");
  }

  if (tokenData.expiresAt < new Date()) {
    errors.push("Token has expired");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Get detailed error message for login failures
 * @param {Array} errors - Array of error messages
 * @param {Array} warnings - Array of warning messages
 * @returns {String} Formatted error message
 */
const formatLoginErrorMessage = (errors, warnings = []) => {
  let message = "Login failed: ";

  if (errors.length > 0) {
    message += errors.join(". ");
  }

  if (warnings.length > 0) {
    message += " Warnings: " + warnings.join(". ");
  }

  return message;
};

/**
 * Log detailed validation information
 * @param {String} context - Context of validation
 * @param {Object} data - Data being validated
 * @param {Object} result - Validation result
 */
const logValidationResult = (context, data, result) => {
  console.log(`=== ${context.toUpperCase()} VALIDATION ===`);
  console.log("Data:", data);
  console.log("Is Valid:", result.isValid);

  if (result.errors.length > 0) {
    console.log("Errors:", result.errors);
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:", result.warnings);
  }

  console.log("================================");
};

module.exports = {
  validateUserLoginStatus,
  validateTokenData,
  formatLoginErrorMessage,
  logValidationResult,
};
