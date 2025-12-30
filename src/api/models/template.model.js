/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const TemplateSchema = new mongoose.Schema(
  {
    templateId: {
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
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    questions: [
      {
        question_number: {
          type: Number,
          required: true,
        },
        question: String,
        questionType: String,
        options: [
          {
            optionNumber: {
              type: Number,
            },
            value: String,
          },
        ],
      },
    ],
    answers: {},
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
      required: true,
      default: 3,
    },
    created_by: {
      type: mongoose.Types.ObjectId,
      required: true,
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

TemplateSchema.method(
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
  }
);

TemplateSchema.statics = {
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

module.exports = mongoose.model("Template", TemplateSchema);
