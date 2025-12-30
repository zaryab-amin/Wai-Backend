const mongoose = require("mongoose");
const CourseLectureModel = require("./courseLecture.model");

const CourseModuleSchema = new mongoose.Schema(
  {
    moduleId: {
      type: String,
      unique: true,
      maxLength: 64,
      index: true,
      trim: true,
      required: true,
    },
    order: {
      type: Number
    },
    moduleTitle: {
      type: String,
      trim: true,
      required: true,
    },
    course: {
      type: mongoose.Types.ObjectId,
      ref: "Course",
    },
    creditHours: {
      type: Number,
      default: 0
    },
    lectures: [{ type: mongoose.Types.ObjectId, ref: "CourseLecture" }],
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    description: {
      type: String,
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

CourseModuleSchema.pre("deleteOne", async (next) => {
  try {
    // Delete associated lectures
    await CourseLectureModel.deleteMany({ _id: { $in: this.lectures } });
    next();
  } catch (error) {
    next(error);
  }
})

module.exports = mongoose.model("CourseModule", CourseModuleSchema);
