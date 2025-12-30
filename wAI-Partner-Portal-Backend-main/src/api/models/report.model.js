/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const ReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      unique: true,
      maxLength: 64,
      trim: true,
      required: true,
    },
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
    },
    quizId: {
      type: mongoose.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
    },
    totalScore: {
      type: Number,
      required: true,
    },
    feedback: {
      type: String,
      default: "",
    },
    attempted_questions: {
      type: Object,
      default: null,
    },
    descriptive_answers: {
      type: Object,
      default: null,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    quizStarted: {
      type: Date,
      default: Date.now(),
    },
    quizEnded: {
      type: Date,
      default: Date.now(),
    },
    updatedAt: {
      type: Date,
      default: Date.now(),
    },
    deletedAt: {
      type: Date,
      default: Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

ReportSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = [
        "id",
        "name",
        "questions",
        "answers",
        "created_by",
        "isPublished",
      ];
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

ReportSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let report;
      if (mongoose.Types.ObjectId.isValid(id)) {
        report = await this.findById(id).exec();
      }
      if (report) {
        return report;
      }
      throw new APIError({
        message: "report not found",
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

module.exports = mongoose.model("Report", ReportSchema);
