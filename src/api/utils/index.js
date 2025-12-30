const crypto = require("crypto");
const { getConfig } = require("../../config/vars");

exports.generateId = (length) => {
  return crypto.randomBytes(length).toString("hex");
};

exports.isSuperAdminUser = (user) => {
  return user?.role === "super-admin";
}

exports.isPrescientAdminUser = (user) => {
  const config = getConfig()
  return (
    user?.organization?.toString() === config.prescientOrgId &&
    user?.role !== "user"
  )
}