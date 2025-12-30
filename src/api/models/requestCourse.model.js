/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const RequestCourseSchema = new mongoose.Schema(
  {
    courseTitle: {
      type: String,
    },
    duration: {
      type: String,
    },
    courseType: {
      type: String,
      enum: ["video", "quiz", "textLecture"],
      default: "video",
    },
    coursePrice: {
      type: Number,
      default: 0,
    },
    courseDescription: {
      type: String,
    },
    requestedBy: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
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

RequestCourseSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = [
        "id",
        "courseTitle",
        "duration",
        "lectureType",
        "coursePrice",
        "tableOfContents",
        "requestedBy",
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

RequestCourseSchema.statics = {
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

module.exports = mongoose.model("RequestCourse", RequestCourseSchema);
