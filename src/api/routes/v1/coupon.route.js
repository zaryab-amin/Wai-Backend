/* eslint-disable quotes */
const express = require("express");
const router = express.Router();
const couponController = require("../../controllers/coupon.controller");
const { authorize, SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");

router.post(
  "/create-coupon",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.createCoupon
);

router.put(
  "/update-coupon/:couponId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.updateCoupon
);

router.delete(
  "/delete-coupon/:couponId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.deleteCoupon
);

router.get(
  "/coupons",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.getAllCoupons
);

router.get(
  "/coupon/:couponId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.getCouponDetails
);

router.post(
  "/toggle-coupon/:couponId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.toggleCouponActivation
);

router.get(
  "/coupon-usage-stats/:couponId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.getCouponUsageStats
);

router.get(
  "/user-coupon-usage/:userId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  couponController.viewUserCouponUsage
);

module.exports = router;
