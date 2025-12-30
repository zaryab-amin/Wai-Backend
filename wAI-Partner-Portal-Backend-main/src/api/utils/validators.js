const joi = require("joi");

exports.safeStringValidator = () => {
  return joi.string().regex(/^[A-Za-z0-9#?@:%$&*^()_\-+=`'".,\/\\| ]+$/);
}

exports.safeStringValidatorForManagementEmail = () => {
  return joi.string().regex(
    /^[a-zA-Z0-9._%+-]+@(cacilian|prescientsecurity)\.com$/
  );
}

exports.safeStringValidatorDescription = (field = "Description") => {
  return joi.string()
    .regex(/\S+/)
    .custom((value, helpers) => {
      if (value.includes("<") || value.includes(">")) {
        return helpers.error("any.custom", {
          message: `${field} must not contain following characters < >`,
        });
      }

      return value;
    });
}

exports.safeStringValidatorOptionalDescription = (field = "Description") => {
  return joi.string().custom((value, helpers) => {
    if (value.includes("<") || value.includes(">")) {
      return helpers.error("any.custom", {
        message: `${field} must not contain following characters < >`,
      });
    }

    return value;
  });
}

exports.safeStringValidatorWithAlphabetNumber = () => {
  return joi.string().regex(/^[A-Za-z0-9\s]*$/);
}
exports.safeStringWithOutNumberValidator = () => {
  return joi.string().regex(/^[A-Za-z ']+$/);
}
// const freeDomains = [
//   "gmail.com",
//   "yahoo.com",
//   "outlook.com",
//   "hotmail.com",
//   "microsoft.cm",
// ];
exports.safeEmailValidator = () => {
  return joi.string()
    .regex(/^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
      name: "email",
      invert: false,
    })
    .email({ tlds: false }) // Allow all top-level domains
    .custom((value, helpers) => {
      if (value.length === 0) {
        return helpers.error("any.custom", {
          message: "Please enter an email",
        });
      }

      // const split = value.split("@")[1];
      // if (freeDomains.includes(split)) {
      //   return helpers.error("any.custom", {
      //     message: "Please enter a company email address",
      //   });
      // }

      return value;
    });
}

exports.safeIdValidator = () => {
  return joi.string().regex(/^[a-fA-F0-9]{24}$/);
}

exports.safeURLValidator = () => {
  return joi.string().regex(
    /((?:(?:http?|ftp)[s]*:\/\/)?[a-z0-9-%\/\&=?\.]+\.[a-z]{2,4}\/?([^\s<>\#%"\,\{\}\\|\\\^\[\]`]+)?)/
  );
}