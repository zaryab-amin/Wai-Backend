/* eslint-disable quotes */
const mongoose = require("mongoose");

const courseInvoiceSchema = new mongoose.Schema(
  {
    purchase: {
      type: mongoose.Types.ObjectId,
      ref: "Purchase",
      required: true,
    },
    course: {
      type: mongoose.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    quiz: {
      type: mongoose.Types.ObjectId,
      ref: "Quiz",
      default: null,
    },
    user: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    platformFee: {
      type: Number,
      required: true,
    },
    organizationAmount: {
      type: Number,
      required: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
    },
    purchaseType: {
      type: String,
      enum: ["Course", "Quiz"],
      default: "Course",
    },
    paymentIntentId: {
      type: String,
      required: true,
    },
    // Organization Invoice Details
    organizationInvoiceId: String,
    organizationInvoiceUrl: String,

    // Platform Invoice Details
    platformInvoiceId: String,
    platformInvoiceUrl: String,
    status: {
      type: String,
      enum: ["paid", "failed", "pending"],
      default: "pending",
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);
module.exports = mongoose.model("CourseInvoice", courseInvoiceSchema);
