const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");
const courseModuleModel = require("./courseModule.model");
const courseLectureModel = require("./courseLecture.model");

const CourseSchema = new mongoose.Schema(
  {
    courseId: {
      type: String,
      unique: true,
      maxLength: 64,
      index: true,
      trim: true,
      required: true,
    },
    courseName: {
      type: String,
      maxlength: 100,
      trim: true,
      required: true,
    },
    courseImage: {
      type: String,
      default: null,
    },
    coursePrivacy: {
      type: String,
      enum: ["public", "private", "organization"],
      default: "public",
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    courseType: {
      type: String,
      enum: ["premium", "freemium", "free"],
      default: "free",
    },
    difficultyLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    courseCategory: {
      type: String,
      required: true,
    },
    courseRequirements: {
      type: [String],
      default: [],
      required: true,
    },
    categoryTags: {
      type: [String],
      default: [],
      required: true,
    },
    courseSkills: {
      type: [String],
      default: [],
      required: true,
    },
    coursePrice: {
      type: Number,
      required: () => this.courseType === "premium",
      default: 0,
    },
    certificateDescription: {
      type: String,
      required: false,
    },

    lectures: [{ type: mongoose.Types.ObjectId, ref: "CourseLecture" }],
    modules: [{ type: mongoose.Types.ObjectId, ref: "CourseModule" }],

    created_by: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: false,
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
    stripeProductId: {
      type: String,
    },
    stripePriceId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

CourseSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = [
        "id",
        "courseName",
        "courseImage",
        "coursePrivacy",
        "description",
        "difficultyLevel",
        "courseType",
        "coursePrice",
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
  },
);

CourseSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let course;
      if (mongoose.Types.ObjectId.isValid(id)) {
        course = await this.findById(id).exec();
      }
      if (course) {
        return course;
      }
      throw new APIError({
        message: "course not found",
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

CourseSchema.pre("deleteOne", async (next) => {
  try {
    // Delete associated lectures
    await courseLectureModel.deleteMany({ _id: { $in: this.lectures } });

    // Delete associated modules
    await courseModuleModel.deleteMany({ _id: { $in: this.modules } });
    next();
  } catch (error) {
    next(error);
  }
})

module.exports = mongoose.model("Course", CourseSchema);
