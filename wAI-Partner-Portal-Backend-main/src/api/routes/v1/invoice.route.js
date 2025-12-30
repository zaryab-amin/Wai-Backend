/* eslint-disable quotes */
const express = require("express");
const {
  authorize,
  SUPER_ADMIN,
  // LOGGED_USER,
  ADMIN,
  ORGANIZATION_ADMIN,
} = require("../../middlewares/auth");

const {
  getSubscriptionInvoiceByOrganization,
  getAllInvoiceByOrganization,
} = require("../../controllers/invoice.controller");

const router = express.Router();

router.get(
  "/all",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getAllInvoiceByOrganization
);
router.get(
  "/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getSubscriptionInvoiceByOrganization
);

module.exports = router;
