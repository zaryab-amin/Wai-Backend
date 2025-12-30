/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const InviteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
    },
    invitedBy: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
    },
    quiz: {
      type: String,
      default: null,
    },
    course: {
      type: mongoose.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    isSubmitted: {
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

InviteSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["id", "userId", "quizId", "isSubmitted"];
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

InviteSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let invite;
      if (mongoose.Types.ObjectId.isValid(id)) {
        invite = await this.findById(id).exec();
      }
      if (invite) {
        return invite;
      }
      throw new APIError({
        message: "invite not found",
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

module.exports = mongoose.model("Invite", InviteSchema);
