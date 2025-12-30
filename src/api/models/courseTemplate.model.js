/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const TemplateCourseSchema = new mongoose.Schema(
  {
    templateCourseId: {
      type: String,
      unique: true,
      maxLength: 64,
      trim: true,
      required: true,
    },
    courseName: {
      type: String,
      // unique: true,
      maxlength: 100,
      index: true,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    courseType: {
      type: String,
      enum: ["premium", "freemium", "free"],
      default: "free",
    },
    coursePrice: {
      type: Number,
      required: () => this.courseType === "premium",
      default: 0,
    },
    certificateDescription: {
      type: String,
      required: true,
    },
    lectures: [
      {
        title: { type: String },
        video: { type: String },
        lectureType: {
          type: String,
          enum: ["lecture", "quiz", "textLecture"],
          default: "lecture",
        },
        status: {
          type: String,
          enum: ["not-started", "in-progress", "completed"],
          default: "not-started",
        },
        quiz: {
          type: String,
          default: null,
        },
        lectureContent: {
          type: String,
          default: null,
        },
        reportId: {
          type: String,
          default: null,
        },
      },
    ],

    created_by: {
      type: mongoose.Types.ObjectId,
      required: true,
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
  },
);

TemplateCourseSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["id", "name", "questions", "answers", "created_by"];
      fields.forEach((field) => {
        transformed[field] = this[field];
      });
      return transformed;
    },
  },
  {
    timestamps: true,
  },
);

TemplateCourseSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let template;
      if (mongoose.Types.ObjectId.isValid(id)) {
        template = await this.findById(id).exec();
      }
      if (template) {
        return template;
      }
      throw new APIError({
        message: "Template not found",
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

module.exports = mongoose.model("TemplateCourse", TemplateCourseSchema);
