const mongoose = require("mongoose");

const QuizQuestionSchema = new mongoose.Schema(
  {
    question_number: { type: Number, required: true },
    question: { type: String, required: true },
    questionType: {
      type: String,
      enum: ["mcqs", "yes/no", "descriptiveQuestion"],
      required: true
    },
    isMultipleAnswer: { type: Boolean, default: false },
    options: [{ optionId: String, value: String }],
    correctOption: {
      type: [String],
    },
    descriptiveAnswers: [
      {
        answerId: String,
        value: String,
      },
    ],
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User"
    },
    quiz: {
      type: mongoose.Types.ObjectId,
      ref: "Quiz",
    },
    organization: {
      type: mongoose.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("QuizQuestion", QuizQuestionSchema);
