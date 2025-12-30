/* eslint-disable quotes */
const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    stripeInvoiceId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    purchaseType: {
      type: String,
      enum: ["subscription", "course"],
      default: "subscription",
    },
    status: {
      type: String,
      enum: ["paid", "unpaid", "void", "draft", "open"],
      required: true,
    },
    billingPeriodStart: {
      type: Date,
      required: true,
    },
    billingPeriodEnd: {
      type: Date,
      required: true,
    },
    numberOfUsers: {
      type: Number,
      required: true,
    },
    pricePerUser: {
      type: Number,
      required: true,
    },
    paidAt: {
      type: Date,
    },
    invoice_pdf: {
      type: String, // URL to Stripe invoice PDF
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Invoice", InvoiceSchema);
