/* eslint-disable quotes */
const express = require("express");
const {
  getUserRevenueStats,
  getEarningsChart,
  getUserTopSales,
} = require("../../controllers/adminAnalytics.controller");
const {
  authorize,
  SUPER_ADMIN,
  ADMIN,
  ORGANIZATION_ADMIN,
} = require("../../middlewares/auth");
const router = express.Router();

router.get(
  "/revenue-summary",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getUserRevenueStats
);
router.get(
  "/earning",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getEarningsChart
);
router.get(
  "/topSales",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getUserTopSales
);

module.exports = router;
