/* eslint-disable linebreak-style */
/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const QuizSchema = new mongoose.Schema(
  {
    quizId: {
      type: String,
      unique: true,
      maxLength: 64,
      trim: true,
      required: true,
    },
    name: {
      type: String,
      // unique: true,
      maxlength: 100,
      index: true,
      trim: true,
      required: true,
    },
    quizType: {
      type: String,
      enum: ["premium", "free"],
      default: "free",
    },
    quizImage: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    isCourseQuiz: {
      type: Boolean,
      default: false,
    },
    quizPrice: {
      type: Number,
      required() {
        return this.quizType === "premium";
      },
      default: 0,
    },
    questions: [{ type: mongoose.Types.ObjectId, ref: "QuizQuestion" }],
    created_by: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    screenshotTime: {
      type: Number,
      default: 60000,
    },
    isTabSwiching: {
      type: Boolean,
      default: false,
    },
    attemptsOfQuiz: {
      type: Number,
      // required: true,
      default: 3,
    },
    template: {
      type: String,
    },
    certificateDescription: {
      type: String,
      required: false,
    },
    quizPrivacy: {
      type: String,
      enum: ["public", "private", "organization"],
      default: "public",
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
  },
  {
    timestamps: true,
  }
);

QuizSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = [
        "id",
        "quizId",
        "name",
        "questions",
        "answers",
        "created_by",
        "isPublished",
        "template",
        "quizImage",
        "description",
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

QuizSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let quiz;
      if (mongoose.Types.ObjectId.isValid(id)) {
        let quiz = await this.findById(id).exec();
      }
      if (quiz) {
        return quiz;
      }
      throw new APIError({
        message: "QUiz not found",
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

module.exports = mongoose.model("Quiz", QuizSchema);
