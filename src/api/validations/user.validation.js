const joi = require("joi");
const {
  safeStringValidator,
  safeEmailValidator,
} = require("../utils/validators")

exports.userSchema = joi.object({
  name: safeStringValidator()
    .min(2)
    .max(100)
    .required(),
  email: safeEmailValidator().required(),
  role: joi
    .string()
    .required()
    .valid('user', 'admin', 'super-admin'),
  userType: joi
    .string()
    .required()
    .valid('organization', 'non-organization'),
})