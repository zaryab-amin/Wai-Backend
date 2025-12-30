/* eslint-disable quotes */
/* eslint-disable comma-dangle */
/* eslint-disable linebreak-style */
const { Joi } = require("express-validation");

module.exports = {
  // POST /V1/auth/register
  register: {
    body: Joi.object({
      name: Joi.string().required().max(64),
      email: Joi.string().email().required(),
      role: Joi.string(),
      userType: Joi.string(),
      recaptchaValue: Joi.string(),
    }),
  },

  // POST /V1/auth/login
  login: {
    body: Joi.object({
      email: Joi.string().email().required(),
      recaptchaValue: Joi.string(),
    }),
  },

  // POST /V1/auth/update-status
  activateUserStatus: {
    body: Joi.object({
      email: Joi.string().email().required(),
      isChecked: Joi.bool(),
    }),
  },

  // POST /V1/auth/verify-login
  verifyLogin: {
    body: Joi.object({
      token: Joi.string().required(),
    }),
  },

  // POST /V1/auth/verify-user-email
  verifyUserEmail: {
    body: Joi.object({
      token: Joi.string().required(),
    }),
  },

  // POST /V1/auth/login-google
  loginGoogle: {
    body: Joi.object({
      token: Joi.string().required(),
    }),
  },
};
