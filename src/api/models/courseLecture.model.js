const mongoose = require("mongoose");

const courseLectureSchema = new mongoose.Schema(
  {
    lectureId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseModule",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      required: true,
    },
    lectureType: {
      type: String,
      enum: ["lecture", "quiz", "textLecture", "videoLecture", "documentLecture"],
      default: "lecture",
    },
    lectureContent: {
      type: String,
    },
    videoSrc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LectureVideo",
      default: null
    },
    document: {
      key: { type: String },
      url: { type: String },
      name: { type: String },
      type: { type: String },
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CourseLecture", courseLectureSchema);