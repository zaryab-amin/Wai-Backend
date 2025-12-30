/* eslint-disable quotes */
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ["percentage", "fixed"], required: true },
  discountValue: { type: Number, required: true },
  expirationDate: { type: Date, required: true },
  usageLimit: { type: Number, required: true },
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  userRestrictions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  courseRestrictions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
  updatedAt: { type: Date, default: Date.now },
  organization: {
    type: mongoose.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
});

module.exports = mongoose.model("Coupon", couponSchema);
