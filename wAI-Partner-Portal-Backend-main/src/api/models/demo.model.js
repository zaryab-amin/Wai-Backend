const mongoose = require("mongoose");

const demoSchema = new mongoose.Schema(
  {
    demoId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    videoSrc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LectureVideo",
      default: null,
    },
    document: {
      key: { type: String },
      url: { type: String },
      name: { type: String },
      type: { type: String },
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

demoSchema.index({ organization: 1, status: 1 });
demoSchema.index({ status: 1 });
demoSchema.index({ demoId: 1 });

module.exports = mongoose.model("Demo", demoSchema);