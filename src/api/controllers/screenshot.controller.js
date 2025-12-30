const Screenshot = require("../models/screenshots.model");
const { isSuperAdminUser } = require("../utils");
const { ReqLogger } = require("../utils/Logger");

/* eslint-disable quotes */
exports.postScreenshots = async (req, res, next) => {
  try {
    const screenData = req.body;
    const organization = req?.user?.organization;
    const { userId, quizId, reportId, screenshots } = screenData;
    const data = screenshots.map((screenshot) => ({
      userId,
      quizId,
      reportId,
      screenshots: screenshot,
      organization
    }));
    const result = await Screenshot.insertMany(data);
    ReqLogger(req, "info", "Screenshots successfully saved.");
    return res.status(201).json({
      status: "success",
      message: "Result",
      data: result,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      console.log(error.message);
    } else {
      return next(error);
    }
  }
};

exports.getScreenshots = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const screenshots = await Screenshot.find({
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!screenshots) {
      ReqLogger(req, "error", "No screenshots are available.");
      return res.status(404).json({
        message: "No screenshots are available.",
        success: false,
      });
    }
    ReqLogger(req, "info", "Screenshots successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Screenshots successfully retrieved.",
      data: screenshots,
    });
  } catch (error) {
    return next(error);
  }
};
