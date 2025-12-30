/* eslint-disable quotes */
const mongoose = require("mongoose");

const LectureVideoSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      trim: true,
      required: true,
    },
    url: {
      type: String,
      trim: true,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "uploaded"],
      default: "pending",
    },
    lecture: {
      type: mongoose.Types.ObjectId,
      ref: "CourseLecture",
    },
    updatedAt: {
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
  },
);

module.exports = mongoose.model("LectureVideo", LectureVideoSchema);
