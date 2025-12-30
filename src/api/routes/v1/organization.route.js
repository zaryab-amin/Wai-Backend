/* eslint-disable quotes */
const express = require("express");
const multer = require("multer");
const {
  registerOrganization,
  loginVerification,
  login,
  updateOrganization,
  deleteOrganization,
  getAllOrganizations,
  getOrganizations,
  getOrganization,
  activateOrganizationStatus,
  verifyOrganizationStatus,
  activateOrganization,
  getListOfOrganizations,
  toggleOrganizationActiveStatus,
  extendFreeTrial,
  restrictExpiredFreeTrials,
  upgradeToPremium,
  getSubscriptionStatus,
  checkAccessStatus,
} = require("../../controllers/organization.controller");
const { getUserByOrganization } = require("../../controllers/user.controller");
const {
  authorize,
  SUPER_ADMIN,
  ADMIN,
  ORGANIZATION_ADMIN,
} = require("../../middlewares/auth");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 150 }, // 150 MB file size limit
});

// POST / register-organization
router.post(
  "/register-organization",
  upload.single("file"),
  registerOrganization
);

router.get(
  "/subscription-status",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getSubscriptionStatus
);

router.get(
  "/check-access",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  checkAccessStatus
);

// Upgrade to premium plan - this endpoint should be accessible even after trial expiration
router.post(
  "/upgrade-to-premium",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upgradeToPremium
);

// Admin endpoint to manually restrict expired free trials
router.post(
  "/restrict-expired-trials",
  authorize([SUPER_ADMIN, ADMIN]),
  restrictExpiredFreeTrials
);

router.get(
  "/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getOrganizations
);

router.get("/all", authorize([SUPER_ADMIN, ADMIN]), getAllOrganizations);

router.get(
  "/list",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getListOfOrganizations
);

// POST / verify-login
router.post("/verify-login", loginVerification);

router
  .route("/update-status")
  .put(authorize([SUPER_ADMIN]), activateOrganizationStatus);

router
  .route("/update-verify-status")
  .put(authorize([SUPER_ADMIN]), verifyOrganizationStatus);

router.route("/verify-org-email").post(activateOrganization);
// POST / verify-login
router.post("/login", login);

router
  .route("/:orgId/toggleActiveStatus")
  .put(authorize([SUPER_ADMIN, ADMIN]), toggleOrganizationActiveStatus);

router.put(
  "/update-organization",
  authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]),
  updateOrganization
);

router.get("/get-users-by-organization", authorize(), getUserByOrganization);

router.delete(
  "/delete-organization/:organizationId",
  authorize([SUPER_ADMIN]),
  deleteOrganization
);

// Admin endpoint to extend free trial for an organization
router.post(
  "/:organizationId/extend-trial",
  authorize([SUPER_ADMIN, ADMIN]),
  extendFreeTrial
);

module.exports = router;
