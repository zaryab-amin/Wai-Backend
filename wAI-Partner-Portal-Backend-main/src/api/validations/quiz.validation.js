const joi = require("joi");
const { safeStringValidator } = require("../utils/validators");

exports.createQuizSchema = joi.object({
  name: safeStringValidator().min(2).max(100).required(),
  description: joi.string().required(),
  certificateDescription: joi.string().required(),
});

exports.updateQuizSchema = joi.object({
  name: safeStringValidator().min(2).max(100).required(),
  description: joi.string().required(),
});

exports.quizQuestionSchema = joi.object({
  question_number: joi.number().required(),
  question: joi.string().required(),
  questionType: joi
    .string()
    .required()
    .valid("descriptiveQuestion", "mcqs", "yes/no"),
  correctOption: joi.array()
    .items(joi.string())
    .optional()
    .default([]),
  isMultipleAnswer: joi.boolean().optional().default(false),
  // correctOption: joi.string().optional().default(""),
  descriptiveAnswers: joi
    .array()
    .items(
      joi.object({
        _id: joi.string().optional(),
        answerId: joi.string(),
        value: joi.string(),
      })
    )
    .optional(),
  options: joi
    .array()
    .items(
      joi.object({
        _id: joi.string().optional(),
        optionId: joi.string(),
        value: joi.string(),
      })
    )
    .optional(),
});

exports.updateQuizSettingSchema = joi.object({
  quizType: joi.string().required().valid("premium", "free"),
  quizPrice: joi
    .number()
    .default(0)
    .when("quizType", {
      is: "premium",
      then: joi.number().greater(0).required(),
      otherwise: joi.number().default(0),
    }),
  screenshotTime: joi.number().greater(0).required(),
  isTabSwiching: joi.boolean().required(),
  attemptsOfQuiz: joi.number().greater(0).required(),
});

exports.quizPrivacySchema = joi.object({
  quizPrivacy: joi
    .string()
    .required()
    .valid("public", "private", "organization"),
});
