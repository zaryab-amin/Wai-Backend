/* eslint-disable linebreak-style */
/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const ScreenshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    quizId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    reportId: {
      type: String,
    },
    screenshots: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now(),
    },
    deletedAt: {
      type: Date,
      default: Date.now(),
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ScreenshotSchema.method(
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

ScreenshotSchema.statics = {
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

module.exports = mongoose.model("Screenshot", ScreenshotSchema);
