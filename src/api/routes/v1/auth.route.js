/* eslint-disable quotes */
const express = require("express");
const { validate } = require("express-validation");

const controller = require("../../controllers/auth.controller");
const {
  authorize,
  SUPER_ADMIN,
  ADMIN,
  ORGANIZATION_ADMIN,
} = require("../../middlewares/auth");

const {
  register,
  activateUserStatus,
  verifyLogin,
  verifyUserEmail,
  loginGoogle,
} = require("../../validations/auth.validation");

const router = express.Router();

// register route
router.route("/register").post(controller.register);

// register super admin route
router
  .route("/register-super-admin")
  .post(
    validate(register, {}, {}),
    authorize([SUPER_ADMIN]),
    controller.registerSuperAdmin
  );

router
  .route("/register-admin")
  .post(
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.registerAdmin
  );

// login route
router.route("/login").post(controller.login);
router.post('/set-password', controller.setPassword);
router
  .route("/login-organization")
  .post(controller.login);
router.put(
  "/update-role",
  authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]),
  controller.updateUserRole
);

router
  .route("/bulk-users")
  .post(
    authorize(),
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.addBulkUsers
  );

// super-admin route
router
  .route("/update-status")
  .put(
    validate(activateUserStatus, {}, {}),
    authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]),
    controller.activateUserStatus
  );

router.route("/saas").post(authorize(), controller.acceptSaasAgreement);
router.route("/saas").get(authorize(), controller.getSaasAgreementStatus);
// login route
router.route("/verify-login").post(validate(verifyLogin), controller.login);

router
  .route("/verify-user-email")
  .post(validate(verifyUserEmail), controller.activateUser);

router.route("/verify-recaptcha").post(controller.verifyRecaptcha);

router.route("/refresh-token").post(controller.refresh);

router
  .route("/login-google")
  .post(validate(loginGoogle), controller.loginWithGoogle);

router.route("/accept-cookies").post(controller.acceptCookies);

router.route("/decline-cookies").post(controller.declineCookies);

// Token cleanup route for administrators
router
  .route("/cleanup-tokens")
  .post(authorize([SUPER_ADMIN, ADMIN]), controller.cleanupTokens);

module.exports = router;
