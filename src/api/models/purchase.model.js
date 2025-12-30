/* eslint-disable linebreak-style */
/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const PurchaseSchema = new mongoose.Schema({
  purchaseId: {
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
  // courseId: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "Course",
  //   required: true,
  // },
  courseProgress: {
    type: Number,
    default: 0,
  },
  hasPurchased: {
    type: Boolean,
    default: false,
  },
  coupon: {
    type: String,
    default: null,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  // create only when users clicks on a specific lecture to avoid cluttering the database at the time of enrollment
  lectures: [
    {
      lecture: { type: mongoose.Schema.Types.ObjectId, ref: "CourseLecture" },
      report: {
        type: mongoose.Types.ObjectId,
        ref: "Report",
        default: null,
      },
      completedAt: { type: Date, default: null },
      progress: {
        type: Number,
        default: 0,
      },
    },
  ],
  // create only when users clicks on a specific module to avoid cluttering the database at the time of enrollment
  modules: [
    {
      module: { type: mongoose.Schema.Types.ObjectId, ref: "CourseModule" },
      completedAt: { type: Date, default: null },
      completedCreditHours: { type: Number, default: 0 },
      progress: {
        type: Number,
        default: 0,
      },
    },
  ],
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
  lastOpenedAt: {
    type: Date,
    default: Date.now,
  },
});
PurchaseSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["id", "user", "course", "amount", "paymentId", "status"];
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

PurchaseSchema.statics = {
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

module.exports = mongoose.model("Purchase", PurchaseSchema);
