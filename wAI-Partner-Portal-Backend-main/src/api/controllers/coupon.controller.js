/* eslint-disable consistent-return */
/* eslint-disable linebreak-style */
/* eslint-disable quotes */
const Coupon = require("../models/coupon.model");
const User = require("../models/user.model");
const { isSuperAdminUser } = require("../utils");
const { validateCoupon } = require("../utils/coupon");
const { ObjectId } = require("mongodb");
// Create Coupon
exports.createCoupon = async (req, res) => {
  try {
    const organization = req?.user?.organization;
    const {
      code,
      discountType,
      discountValue,
      expirationDate,
      usageLimit,
      userRestrictions,
      courseRestrictions,
      adminId,
    } = req.body;
    const newCoupon = new Coupon({
      code,
      discountType,
      discountValue,
      expirationDate,
      usageLimit,
      userRestrictions,
      courseRestrictions,
      organization: new ObjectId(organization),
      adminId,
    });
    await newCoupon.save();
    res
      .status(201)
      .json({ message: "Coupon created successfully", coupon: newCoupon });
  } catch (error) {
    res.status(400).json({ message: "Error creating coupon", error });
  }
};

// Update Coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const updatedData = req.body;

    const coupon = await Coupon.findOne({
      _id: new ObjectId(couponId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    })

    if (!coupon) {
      return res.status(400).json({ message: "Coupon does not exist" })
    }

    const updatedCoupon = await Coupon.updateOne(
      { _id: new ObjectId(couponId) },
      updatedData,
      { new: true }
    );
    res
      .status(200)
      .json({ message: "Coupon updated successfully", coupon: updatedCoupon });
  } catch (error) {
    res.status(400).json({ message: "Error updating coupon", error });
  }
};

// Delete Coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)

    const coupon = await Coupon.findOne({
      _id: new ObjectId(couponId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    })

    if (!coupon) {
      return res.status(400).json({ message: "Coupon does not exist" })
    }
    await Coupon.deleteOne({ _id: new ObjectId(couponId) });
    res.status(200).json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: "Error deleting coupon", error });
  }
};

// Get All Coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const coupons = await Coupon.find({
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    }).exec();
    res.status(200).json({ coupons });
  } catch (error) {
    res.status(400).json({ message: "Error fetching coupons", error });
  }
};

// Get Coupon Details
exports.getCouponDetails = async (req, res) => {
  try {
    const { couponId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const coupon = await Coupon.findById({
      _id: new ObjectId(couponId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    res.status(200).json({ coupon });
  } catch (error) {
    res.status(400).json({ message: "Error fetching coupon details", error });
  }
};

// Toggle Coupon Activation
exports.toggleCouponActivation = async (req, res) => {
  try {
    const { couponId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)

    const coupon = await Coupon.findById({
      _id: new ObjectId(couponId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.status(200).json({ message: "Coupon activation toggled", coupon });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error toggling coupon activation", error });
  }
};

// Get Coupon Usage Statistics
exports.getCouponUsageStats = async (req, res) => {
  try {
    const { couponId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)

    const coupon = await Coupon.findById({
      _id: new ObjectId(couponId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    res.status(200).json({ usageCount: coupon.usageCount });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error fetching coupon usage statistics", error });
  }
};

// View User-Specific Coupon Usage
exports.viewUserCouponUsage = async (req, res) => {
  try {
    const { userId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const user = await User.findById({
      _id: new ObjectId(userId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})

    }).populate("coupons");
    res.status(200).json({ coupons: user.coupons });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error fetching user coupon usage", error });
  }
};

// Apply Coupon
exports.applyCoupon = async (req, res) => {
  try {
    const { userId, courseId, couponCode } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const validationResult = await validateCoupon(
      couponCode,
      userId,
      courseId,
      isSuperAdmin ? undefined : organization
    );
    if (!validationResult.valid) {
      return res.status(400).json({ message: validationResult.message });
    }
    const { coupon } = validationResult;
    coupon.usageCount += 1;
    await coupon.save();
    return res.status(200).json({
      message: "Coupon applied successfully",
      discount: coupon.discountValue,
    });
  } catch (error) {
    res.status(400).json({ message: "Error applying coupon", error });
  }
};

// Get Available Coupons for User
exports.getAvailableCouponsForUser = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming user ID is available in req.user
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const coupons = await Coupon.find({
      userRestrictions: { $in: [userId] },
      isActive: true,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    res.status(200).json({ coupons });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error fetching available coupons", error });
  }
};

// Get Coupon Details for User
exports.getCouponDetailsForUser = async (req, res) => {
  try {
    const { couponCode } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const coupon = await Coupon.findOne({
      code: couponCode,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    res.status(200).json({ coupon });
  } catch (error) {
    res.status(400).json({ message: "Error fetching coupon details", error });
  }
};

// Check Eligible Coupons for Course
exports.getEligibleCouponsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user)
    const coupons = await Coupon.find({
      courseRestrictions: { $in: [courseId] },
      isActive: true,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {})
    });
    res.status(200).json({ coupons });
  } catch (error) {
    res.status(400).json({ message: "Error fetching eligible coupons", error });
  }
};
