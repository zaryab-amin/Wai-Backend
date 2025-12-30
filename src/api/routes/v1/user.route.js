/* eslint-disable quotes */
const express = require("express");
const validate = require("express-validation");
const controller = require("../../controllers/user.controller");
const {
  authorize,
  ADMIN,
  LOGGED_USER,
  ORGANIZATION_ADMIN,
  SUPER_ADMIN,
} = require("../../middlewares/auth");

const router = express.Router();

router.put("/invite/accept/:inviteKey", controller.updateInviteUser);

/**
 * Load user when API with userId route parameter is hit
 */
router.param("userId", controller.load);

router
  .route("/")
  .get(authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]), controller.list)
  .post(authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), controller.create);

router.get(
  "/all",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  controller.getAllUsers
);

router.post(
  "/inviteUser",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  controller.createInviteUser
);

router.route("/deactivate").put(authorize(), controller.deactivateUser);

router.post(
  "/resendInvite",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  controller.resendInvite
);

router.get("/invite/:inviteKey", authorize(), controller.getInviteUser);

router
  .route("/client-users")
  .get(
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.listOfClientsUsers
  );

router.route("/profile").get(authorize(), controller.loggedIn);

router.put("/updateSettings", authorize(), controller.updateUserSettings);

router
  .route("/:userId")
  .put(
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.updateUser
  );

router
  .route("/:userId/toggleActiveStatus")
  .put(
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.toggleUserActiveStatus
  );

router
  .route("/:userId")
  .get(authorize([SUPER_ADMIN]), controller.get)
  .delete(
    authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
    controller.deleteUser
  );

router.put(
  "/toggleNotifications",
  authorize(),
  controller.toggleUserNotification
);

module.exports = router;
