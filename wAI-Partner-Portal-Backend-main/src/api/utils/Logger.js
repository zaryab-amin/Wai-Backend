const winston = require("winston");

const winstonLogger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
  exitOnError: false, // do not exit on handled exceptions
});

const ReqLogger = async (req, severity, message) => {
  try {
    const userInfo = await req.user;
    const path = req.originalUrl || req.path;
    const ips = req.headers["x-forwarded-for"]
      ? req.headers["x-forwarded-for"].split(" ")
      : [];
    const ip = ips.length ? ips[ips.length - 1] : req.ip || "";
    const { email, role } = userInfo || {
      email: "unauthenticated",
      role: "unauthenticated",
    };

    winstonLogger.log(severity, message, {
      label: "datadog",
      path: path,
      user: email,
      role: role,
      ipaddress: ip,
    });
  } catch (error) {
    console.error(error);
  }
};

const InfoLogger = async (
  info,
  severity,
  message
) => {
  winstonLogger.log(severity, message, {
    label: "datadog",
    user: info?.email ?? "",
    timestamp: (new Date()).getTime()
  });
};

module.exports = { ReqLogger, InfoLogger };
