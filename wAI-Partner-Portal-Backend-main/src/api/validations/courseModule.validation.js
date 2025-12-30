const joi = require("joi");
const {
  // safeStringValidator,
  safeStringValidatorDescription,
} = require("../utils/validators")


exports.addCourseModuleSchema = joi.object({
  moduleTitle: safeStringValidatorDescription()
    .min(2)
    .max(100)
    .required(),
  order: joi.number().required(),
  creditHours: joi.number().optional().allow(0).default(0),
  // description: safeStringValidatorDescription().required(),
});
