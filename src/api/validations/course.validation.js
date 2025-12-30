const joi = require("joi");
const { safeStringValidator } = require("../utils/validators");

exports.createCourseSchema = joi.object({
  courseName: safeStringValidator().min(2).max(100).required(),
  courseCategory: safeStringValidator().required(),
  difficultyLevel: joi
    .string()
    .required()
    .valid("beginner", "intermediate", "advanced"),
  description: joi.string().required(),
  courseType: joi.string().required().valid("premium", "freemium", "free"),
  courseSkills: joi
    .array()
    .items(joi.string())
    .min(1)
    .message("Please provide the skills related to the course"),
  courseRequirements: joi
    .array()
    .items(joi.string())
    .min(1)
    .message("Please list all the course requirements"),
  certificateDescription: joi.string().required(),
  coursePrice: joi
    .number()
    .default(0)
    .when("courseType", {
      is: "premium",
      then: joi.number().greater(0).required(),
      otherwise: joi.number().default(0),
    }),
});

exports.courseStatusSchema = joi.object({
  status: joi.string().required().valid("draft", "published"),
});

exports.coursePrivacySchema = joi.object({
  coursePrivacy: joi.string().required().valid("public", "private", "organization"),
});

// PUT /v1/course/change-privacy
exports.changePrivacyStatusSchema = joi.object({
  courseId: joi.string().required(),
  status: joi.string().valid("public", "private").required(),
});
