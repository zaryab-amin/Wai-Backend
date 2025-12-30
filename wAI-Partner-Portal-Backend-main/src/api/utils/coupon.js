/* eslint-disable quotes */
const Coupon = require("../models/coupon.model");
const { ObjectId } = require("mongodb");

exports.validateCoupon = async (couponCode, userId, courseId, organization) => {
  try {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true, organization: new ObjectId(organization) });
    if (!coupon) {
      return { valid: false, message: "Invalid or inactive coupon" };
    }
    if (coupon.expirationDate < new Date()) {
      return { valid: false, message: "Coupon has expired" };
    }
    if (coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, message: "Coupon usage limit reached" };
    }
    if (
      coupon.userRestrictions.length &&
      !coupon.userRestrictions.includes(userId)
    ) {
      return { valid: false, message: "User is not eligible for this coupon" };
    }
    if (
      coupon.courseRestrictions.length &&
      !coupon.courseRestrictions.includes(courseId)
    ) {
      return { valid: false, message: "Coupon not valid for this course" };
    }
    return { valid: true, coupon };
  } catch (error) {
    throw new Error("Error validating coupon");
  }
};

exports.validateCouponForCourse = async (couponCode, courseId, organization) => {
  try {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true, organization: new ObjectId(organization) });
    if (!coupon) {
      return { valid: false, message: "Invalid or inactive coupon" };
    }
    if (coupon.expirationDate < new Date()) {
      return { valid: false, message: "Coupon has expired" };
    }
    if (coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, message: "Coupon usage limit reached" };
    }
    if (
      coupon.courseRestrictions.length &&
      !coupon.courseRestrictions.includes(courseId)
    ) {
      return { valid: false, message: "Coupon not valid for this course" };
    }
    return { valid: true, discount: coupon.discountValue };
  } catch (error) {
    throw new Error("Error validating coupon for course");
  }
};
