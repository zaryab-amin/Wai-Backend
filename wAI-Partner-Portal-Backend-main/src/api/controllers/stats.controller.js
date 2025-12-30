const { ReqLogger } = require("../utils/Logger");
const PurchaseCourse = require("../models/purchase.model");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const Certificate = require("../models/certificate.model");
const {
  getPastSevenDays,
  getPastSevenWeeks,
  getPastTwelveMonths,
} = require("../utils/timeUtils");
const { ObjectId } = require("mongodb");
const { isSuperAdminUser } = require("../utils");

exports.getUserStats = async (req, res, next) => {
  try {
    const user = req.user._id;
    const purchasedCourses = await PurchaseCourse.find({
      user,
      hasPurchased: true,
    }).populate("course", "isPublished");

    const totalCourses = purchasedCourses.filter(
      (item) => item.course && item.course.isPublished
    ).length;

    const totalQuizzes = await PurchaseQuiz.countDocuments({
      user,
      hasPurchased: true,
    });

    const totalCertificates = await Certificate.countDocuments({
      user,
    });

    ReqLogger(req, "info", "user stats fetched successfully");
    return res
      .status(200)
      .json({ totalCourses, totalQuizzes, totalCertificates });
  } catch (error) {
    return next(error);
  }
};

exports.getUserCoursesStats = async (req, res, next) => {
  try {
    const user = req.user._id;
    const period = req.query.period;

    let dateRanges;

    switch (period) {
      case "weekly":
        dateRanges = getPastSevenWeeks();
        break;
      case "yearly":
        dateRanges = getPastTwelveMonths();
        break;
      case "daily":
      default:
        dateRanges = getPastSevenDays();
        break;
    }

    const counts = await Promise.all(
      dateRanges.map(async ({ start, end }) => {
        const count = await PurchaseCourse.countDocuments({
          user,
          // organization: organizationId
          //   ? new ObjectId(organizationId)
          //   : undefined,
          createdAt: { $gte: start, $lt: end },
        });
        return count;
      })
    );

    const totalCount = await PurchaseCourse.countDocuments({
      user,
      // organization: organizationId
      //   ? new ObjectId(organizationId)
      //   : undefined,
    });

    const periodTotal = counts.reduce((sum, count) => sum + count, 0);

    ReqLogger(req, "info", "user courses stats fetched successfully");
    return res.status(200).json({
      data: [dateRanges.map((data) => data.start), counts],
      totals: {
        period: periodTotal,
        allTime: totalCount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getUserQuizzesStats = async (req, res, next) => {
  try {
    const user = req.user._id;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;
    const period = req.query.period;

    let dateRanges;

    switch (period) {
      case "weekly":
        dateRanges = getPastSevenWeeks();
        break;
      case "yearly":
        dateRanges = getPastTwelveMonths();
        break;
      case "daily":
      default:
        dateRanges = getPastSevenDays();
        break;
    }

    const counts = await Promise.all(
      dateRanges.map(async ({ start, end }) => {
        const count = await PurchaseQuiz.countDocuments({
          user,
          // organization: organizationId
          //   ? new ObjectId(organizationId)
          //   : undefined,
          createdAt: { $gte: start, $lt: end },
        });
        return count;
      })
    );
    const totalCount = await PurchaseQuiz.countDocuments({
      user,
      // organization: organizationId
      //   ? new ObjectId(organizationId)
      //   : undefined,
    });

    const periodTotal = counts.reduce((sum, count) => sum + count, 0);
    ReqLogger(req, "info", "user quizzes stats fetched successfully");
    return res.status(200).json({
      data: [dateRanges.map((data) => data.start), counts],
      totals: {
        period: periodTotal,
        allTime: totalCount,
      },
    });
  } catch (error) {
    return next(error);
  }
};
