const Stripe = require("stripe");
const Organization = require("../models/organization.model");
const crypto = require("crypto");
const { getConfig } = require("../../config/vars");

// Utility function to validate Stripe account capabilities
const validateStripeAccount = (account) => {
  const requirements = [];

  if (!account.charges_enabled) {
    requirements.push("Charges must be enabled");
  }
  if (!account.payouts_enabled) {
    requirements.push("Payouts must be enabled");
  }
  if (!account.details_submitted) {
    requirements.push("Account details must be completed");
  }

  return {
    isValid:
      account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted,
    requirements,
  };
};

// Modified Create Controller without encryption
exports.connectStripeWithKey = async (req, res) => {
  try {
    const { organizationId, stripeSecretKey, stripePublishableKey } = req.body;

    // Enhanced input validation
    const validationErrors = {
      secretKey: !stripeSecretKey
        ? "Secret key is required"
        : !stripeSecretKey.startsWith("sk_")
        ? "Secret key must start with 'sk_'"
        : null,
      publishableKey: !stripePublishableKey
        ? "Publishable key is required"
        : !stripePublishableKey.startsWith("pk_")
        ? "Publishable key must start with 'pk_'"
        : null,
    };

    const errors = Object.entries(validationErrors)
      .filter(([_, value]) => value !== null)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        details: errors,
      });
    }

    // Find organization
    const organization = await Organization.findOne({
      _id: organizationId,
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
        details: `No organization found with ID: ${organizationId}`,
      });
    }

    if (organization.stripeAccountId) {
      return res.status(409).json({
        success: false,
        error: "Stripe already connected",
        details: {
          accountId: organization.stripeAccountId,
          status: organization.stripeAccountStatus,
          connectedAt: organization.updatedAt,
        },
      });
    }

    // Initialize and verify Stripe client
    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16", // Specify latest stable API version
    });
    const account = await stripeClient.account.retrieve();

    console.log("account--------------->", account);

    // Validate account capabilities
    const accountValidation = validateStripeAccount(account);
    if (!accountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Account requirements not met",
        details: {
          requirements: accountValidation.requirements,
          accountLink: `https://dashboard.stripe.com/${account.id}/account/setup`,
        },
      });
    }

    const existingOrg = await Organization.findOne({
      stripeAccountId: account.id,
    });
    if (existingOrg) {
      return res.status(409).json({
        success: false,
        error: "Stripe account already connected",
        details: {
          accountId: account.id,
          connectedOrganization: existingOrg._id,
        },
      });
    }

    // Update organization
    const updatedOrg = await Organization.findOneAndUpdate(
      { _id: organizationId },
      {
        stripeAccountId: account.id,
        stripeSecretKey: stripeSecretKey,
        stripePublishableKey: stripePublishableKey,
        stripeAccountStatus: "active",
        stripeAccountDetails: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          country: account.country,
          currency: account.default_currency,
          businessType: account.business_type,
          businessProfile: account.business_profile,
          paymentMethods: account.capabilities,
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      accountId: account.id,
      accountStatus: {
        status: "active",
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        country: account.country,
        currency: account.default_currency,
      },
      organization: {
        id: updatedOrg._id,
        name: updatedOrg.name,
        stripeStatus: updatedOrg.stripeAccountStatus,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    const errorResponse = {
      success: false,
      timestamp: new Date(),
      path: req.originalUrl,
    };

    if (error.type === "StripeAuthenticationError") {
      return res.status(401).json({
        ...errorResponse,
        error: "Authentication Failed",
        details: "The provided Stripe API key is invalid or expired",
        code: "STRIPE_AUTH_ERROR",
      });
    }

    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        ...errorResponse,
        error: "Invalid Request",
        details: error.message,
        code: "STRIPE_INVALID_REQUEST",
      });
    }

    console.error("Stripe connection error:", {
      error: error.message,
      organizationId: req.params.organizationId,
      timestamp: new Date(),
      stack: error.stack,
    });

    res.status(500).json({
      ...errorResponse,
      error: "Internal Server Error",
      details:
        "An unexpected error occurred while connecting the Stripe account",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
};

// exports.connectStripeWithKey = async (req, res) => {
//   try {
//     const config = getConfig();
//     const { organizationId, stripeSecretKey, stripePublishableKey } = req.body;

//     // Input validation
//     const validationErrors = {
//       secretKey: !stripeSecretKey
//         ? "Secret key is required"
//         : !stripeSecretKey.startsWith("sk_")
//         ? "Secret key must start with 'sk_'"
//         : null,
//       publishableKey: !stripePublishableKey
//         ? "Publishable key is required"
//         : !stripePublishableKey.startsWith("pk_")
//         ? "Publishable key must start with 'pk_'"
//         : null,
//     };

//     const errors = Object.entries(validationErrors)
//       .filter(([_, value]) => value !== null)
//       .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

//     if (Object.keys(errors).length > 0) {
//       return res.status(400).json({
//         success: false,
//         error: "Validation Error",
//         details: errors,
//       });
//     }

//     const organization = await Organization.findOne({ _id: organizationId });
//     if (!organization) {
//       return res.status(404).json({
//         success: false,
//         error: "Organization not found",
//       });
//     }

//     if (organization.stripeAccountId) {
//       return res.status(409).json({
//         success: false,
//         error: "Stripe already connected",
//         details: {
//           accountId: organization.stripeAccountId,
//           status: organization.stripeAccountStatus,
//         },
//       });
//     }

//     const stripeClient = new Stripe(config.stripeSecretKey, {
//       apiVersion: "2023-10-16",
//     });

//     const account = await stripeClient.accounts.create({
//       type: "standard",
//       country: "US",
//       capabilities: {
//         card_payments: { requested: true },
//         transfers: { requested: true },
//       },
//       metadata: {
//         organizationId,
//       },
//     });

//     const updatedOrg = await Organization.findOneAndUpdate(
//       { _id: organizationId },
//       {
//         stripeAccountId: account.id,
//         stripeSecretKey,
//         stripePublishableKey,
//         stripeAccountStatus: "active",
//         stripeAccountDetails: {
//           chargesEnabled: account.charges_enabled,
//           payoutsEnabled: account.payouts_enabled,
//           detailsSubmitted: account.details_submitted,
//           country: account.country,
//           currency: account.default_currency,
//           businessType: account.business_type,
//           capabilities: account.capabilities,
//         },
//       },
//       { new: true }
//     );

//     return res.json({
//       success: true,
//       accountId: account.id,
//       accountStatus: {
//         status: "active",
//         chargesEnabled: account.charges_enabled,
//         payoutsEnabled: account.payouts_enabled,
//         detailsSubmitted: account.details_submitted,
//         country: account.country,
//         currency: account.default_currency,
//       },
//       organization: {
//         id: updatedOrg._id,
//         name: updatedOrg.name,
//         stripeStatus: updatedOrg.stripeAccountStatus,
//       },
//     });
//   } catch (error) {
//     console.error("Stripe connection error:", {
//       error: error.message,
//       organizationId: req.body.organizationId,
//       timestamp: new Date(),
//       stack: error.stack,
//     });

//     if (error.type === "StripeAuthenticationError") {
//       return res.status(401).json({
//         success: false,
//         error: "Authentication Failed",
//         details: "Invalid API key",
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       error: "Internal Server Error",
//       details: "Failed to connect Stripe account",
//     });
//   }
// };

// // New Update Controller

// exports.updateStripeKeys = async (req, res) => {
//   try {
//     const { organizationId } = req.body;
//     const config = getConfig();

//     const stripeClient = new Stripe(config.stripeSecretKey, {
//       apiVersion: "2023-10-16",
//     });

//     // Create a test connected account
//     try {
//       const account = await stripeClient.accounts.create({
//         type: "standard",
//         country: "US",
//         capabilities: {
//           card_payments: { requested: true },
//           transfers: { requested: true },
//         },
//         metadata: {
//           organizationId: organizationId,
//         },
//       });

//       console.log("Test Account Created:", {
//         accountId: account.id,
//         capabilities: account.capabilities,
//       });

//       // Update organization with test account details
//       const updatedOrg = await Organization.findOneAndUpdate(
//         { _id: organizationId },
//         {
//           stripeAccountId: account.id,
//           stripeAccountStatus: "active",
//           stripeAccountDetails: {
//             chargesEnabled: account.charges_enabled,
//             payoutsEnabled: account.payouts_enabled,
//             detailsSubmitted: account.details_submitted,
//             country: account.country,
//             currency: account.default_currency,
//           },
//         },
//         { new: true }
//       );

//       if (!updatedOrg) {
//         return res.status(404).json({
//           success: false,
//           error: "Organization not found",
//         });
//       }

//       res.json({
//         success: true,
//         accountId: account.id,
//         message: "Test account created successfully",
//       });
//     } catch (stripeError) {
//       console.error("Stripe Account Creation Error:", stripeError);
//       return res.status(400).json({
//         success: false,
//         error: stripeError.message,
//       });
//     }
//   } catch (error) {
//     console.error("Server Error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to update Stripe details",
//     });
//   }
// };

exports.updateStripeKeys = async (req, res) => {
  try {
    const { organizationId, stripeSecretKey, stripePublishableKey } = req.body;

    // Enhanced input validation
    const validationErrors = {
      secretKey: !stripeSecretKey
        ? "Secret key is required"
        : !stripeSecretKey.startsWith("sk_")
        ? "Secret key must start with 'sk_'"
        : null,
      publishableKey: !stripePublishableKey
        ? "Publishable key is required"
        : !stripePublishableKey.startsWith("pk_")
        ? "Publishable key must start with 'pk_'"
        : null,
    };

    const errors = Object.entries(validationErrors)
      .filter(([_, value]) => value !== null)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        details: errors,
      });
    }

    // Find organization
    const organization = await Organization.findOne({
      _id: organizationId,
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
        details: `No organization found with ID: ${organizationId}`,
      });
    }

    // Initialize and verify new Stripe client
    const stripeClient = stripe(stripeSecretKey);
    const account = await stripeClient.account.retrieve();

    // Validate account capabilities
    const accountValidation = validateStripeAccount(account);
    if (!accountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Account requirements not met",
        details: {
          requirements: accountValidation.requirements,
          accountLink: `https://dashboard.stripe.com/${account.id}/account/setup`,
        },
      });
    }

    // Update organization
    const updatedOrg = await Organization.findOneAndUpdate(
      { _id: organizationId },
      {
        stripeSecretKey: stripeSecretKey,
        stripePublishableKey: stripePublishableKey,
        stripeAccountStatus: "active",
        stripeAccountDetails: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          country: account.country,
          currency: account.default_currency,
          businessType: account.business_type,
          businessProfile: account.business_profile,
          paymentMethods: account.capabilities,
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      accountId: account.id,
      accountStatus: {
        status: "active",
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        country: account.country,
        currency: account.default_currency,
      },
      organization: {
        id: updatedOrg._id,
        name: updatedOrg.name,
        stripeStatus: updatedOrg.stripeAccountStatus,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    const errorResponse = {
      success: false,
      timestamp: new Date(),
      path: req.originalUrl,
    };

    if (error.type === "StripeAuthenticationError") {
      return res.status(401).json({
        ...errorResponse,
        error: "Authentication Failed",
        details: "The provided Stripe API key is invalid or expired",
        code: "STRIPE_AUTH_ERROR",
      });
    }

    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        ...errorResponse,
        error: "Invalid Request",
        details: error.message,
        code: "STRIPE_INVALID_REQUEST",
      });
    }

    console.error("Stripe update error:", {
      error: error.message,
      organizationId: req.params.organizationId,
      timestamp: new Date(),
      stack: error.stack,
    });

    res.status(500).json({
      ...errorResponse,
      error: "Internal Server Error",
      details: "An unexpected error occurred while updating the Stripe account",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
};
