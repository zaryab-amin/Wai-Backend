/* eslint-disable quotes */
const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { omitBy, isBoolean } = require("lodash");
const APIError = require("../errors/api-error");

const folderSchema = new mongoose.Schema(
  {
    folderId: {
      type: String,
      unique: true,
      maxLength: 64,
      trim: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    created_by: {
      type: mongoose.Types.ObjectId,
      ref: "User",
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
    deletedAt: {
      type: Date,
      default: Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

folderSchema.method(
  {
    transform() {
      const transformed = {};
      const fields = ["folderId", "name", "parentFolderId"];
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

folderSchema.statics = {
  async get(id) {
    // eslint-disable-next-line no-useless-catch
    try {
      let folder;
      if (mongoose.Types.ObjectId.isValid(id)) {
        folder = await this.findById(id).exec();
      }
      if (folder) {
        return folder;
      }
      throw new APIError({
        message: "folder not found",
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

module.exports = mongoose.model("Folder", folderSchema);
