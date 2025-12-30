/* eslint-disable quotes */
const express = require("express");
const { authorize, SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");
const { getUnreadNotifications, markAllNotificationsAsRead } = require("../../controllers/notification.controller");

const router = express.Router();

router.get(
  "/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getUnreadNotifications
);

router.post(
  "/mark-all-as-read",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  markAllNotificationsAsRead
);

module.exports = router;
