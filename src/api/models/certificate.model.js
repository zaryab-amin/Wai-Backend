/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const CertificateSchema = new mongoose.Schema({
  certificateId: {
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
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    default: null,
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    default: null,
  },
  certificateTitle: {
    type: String,
    // required: true,
    default: "",
  },
  certificateDescription: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  organization: {
    type: mongoose.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
});

CertificateSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["certificateId", "user", "courseId"];
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

CertificateSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let certificate;
      if (mongoose.Types.ObjectId.isValid(id)) {
        certificate = await this.findById(id).exec();
      }
      if (certificate) {
        return certificate;
      }
      throw new APIError({
        message: "certificate not found",
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

module.exports = mongoose.model("Certificate", CertificateSchema);
