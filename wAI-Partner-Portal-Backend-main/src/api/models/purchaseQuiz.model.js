/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const PurchaseQuizSchema = new mongoose.Schema({
  purchaseQuizId: {
    type: String,
    unique: true,
    maxLength: 64,
    trim: true,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
  },
  quizName: {
    type: String,
    default: null,
    required: true,
  },
  hasPurchased: {
    type: Boolean,
    default: false,
  },
  report: {
    type: mongoose.Types.ObjectId,
    ref: "Report",
    default: null,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["created", "paid", "failed"],
    default: "created",
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
  isConnectedAccount: {
    type: Boolean,
    default: false,
  },
  stripeCustomerId: String,
  sessionId: String,
  paymentId: String,
  paymentStatus: String,
  paymentReceiptUrl: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
PurchaseQuizSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["id", "user", "amount", "paymentId", "status"];
      fields.forEach((field) => {
        transformed[field] = this[field];
      });
      return transformed;
    },
  },
  {
    timestamps: true,
  }
);

PurchaseQuizSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let screenshot;
      if (mongoose.Types.ObjectId.isValid(id)) {
        screenshot = await this.findById(id).exec();
      }
      if (screenshot) {
        return screenshot;
      }
      throw new APIError({
        message: "screenshot not found",
        status: httpStatus.NOT_FOUND,
      });
    } catch (error) {
      throw error;
    }
  },

  list({ page = 1, perPage = 30, isDeleted = false }) {
    const options = omitBy({ isDeleted }, isBoolean(true));

    return this.find(options)
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },
};

module.exports = mongoose.model("PurchaseQuiz", PurchaseQuizSchema);
