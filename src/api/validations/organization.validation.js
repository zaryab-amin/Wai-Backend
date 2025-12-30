const joi = require("joi");
const {
  safeStringValidator,
  safeEmailValidator,
} = require("../utils/validators");

exports.createOrganizationSchema = joi.object({
  name: safeStringValidator().min(2).max(100).required(),
  signatoryName: safeStringValidator().required(),
  phoneNumber: safeStringValidator().required(),
  website: safeStringValidator().required(),
  phoneNumber: safeStringValidator().required(),
  signatoryEmail: safeEmailValidator().required(),
});
