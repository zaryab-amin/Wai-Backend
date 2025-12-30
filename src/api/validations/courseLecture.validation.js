const joi = require("joi");
const {
  // safeStringValidator,
  safeStringValidatorDescription,
} = require("../utils/validators")


exports.addCourseLectureSchema = joi.object({
  title: safeStringValidatorDescription()
    .min(2)
    .max(100)
    .required(),
  order: joi.number().required(),
});

exports.updateCourseLectureSchema = joi.object({
  title: safeStringValidatorDescription()
    .min(2)
    .max(100)
    .required(),
  // description: safeStringValidatorDescription().required(),
  duration: joi.number().allow(0).optional(),
  lectureType: joi
    .string()
    .required()
    .valid('lecture', 'quiz', 'textLecture', 'videoLecture', 'documentLecture'),
  order: joi.number().required(),
  lectureContent: joi.string().allow("").optional(),
});
