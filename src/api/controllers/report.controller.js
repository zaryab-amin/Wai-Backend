/* eslint-disable prefer-destructuring */
/* eslint-disable quotes */
const mongoose = require("mongoose");
const Report = require("../models/report.model");
const { ReqLogger } = require("../utils/Logger");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const APIError = require("../errors/api-error");
const httpStatus = require("http-status");
const Quiz = require("../models/quiz.model");
const { ObjectId } = require("mongodb");
const { isSuperAdminUser } = require("../utils");
const Certificate = require("../models/certificate.model");

exports.getUserReportStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid user ID is required" });
    }

    const totalSpending = await PurchaseQuiz.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          hasPurchased: true,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const totalAmount =
      totalSpending.length > 0 ? totalSpending[0].totalAmount : 0;

    // Get total number of reports for the user
    const totalReports = await Report.countDocuments({
      userId: userId,
      // organization: organizationId ? new ObjectId(organizationId) : undefined,
      isDeleted: false,
    });

    // Get all reports for the user
    const reports = await Report.find(
      {
        userId: userId,
        isDeleted: false,
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      },
      "score totalScore"
    );

    let passedReports = 0;
    let failedReports = 0;

    reports.forEach((report) => {
      if (report.score >= report.totalScore * 0.5) {
        passedReports++;
      } else {
        failedReports++;
      }
    });

    res.json({
      userId,
      totalAmountSpent: totalAmount,
      totalReports,
      passedReports,
      failedReports,
    });
  } catch (error) {
    console.log(`Error in getUserReportStats: ${error.message}`);
    next(error);
  }
};

exports.getResult = async (req, res, next) => {
  try {
    let report;
    const resultId = req.params.resultId;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;

    if (resultId) {
      report = await Report.findOne({
        _id: new ObjectId(resultId),
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      }).exec();
    } else {
      report = await Report.find({
        userId: new ObjectId(req.user._id),
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      }).exec();
    }

    if (!report || (Array.isArray(report) && report.length === 0)) {
      ReqLogger(req, "error", "No report is available.");
      return res.status(404).json({
        message: "No report is available.",
        success: false,
      });
    }

    if (Array.isArray(report)) {
      const quizIds = report.map((rep) => rep.quizId);
      const quizzes = await Quiz.find({
        quizId: { $in: quizIds },
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      }).exec();

      const certificates = await Certificate.find({
        quiz: { $in: quizIds },
        user: new ObjectId(req?.user?._id),
      })
        .populate("user course")
        .exec();

      const quizMap = quizzes.reduce((acc, quiz) => {
        acc[quiz.quizId] = quiz;
        return acc;
      }, {});

      const certificateMap = certificates.reduce((acc, certificate) => {
        acc[certificate.quiz] = certificate;
        return acc;
      }, {});

      report = report.map((rep) => ({
        ...rep.toObject(),
        quiz: quizMap[rep?.quizId] || null,
        certificate: certificateMap[rep?.quizId] || null,
      }));
    } else {
      const quiz = await Quiz.findOne({
        _id: new ObjectId(report.quizId),
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      })
        .populate("questions")
        .exec();
      const certificate = await Certificate.findOne({
        quiz: new ObjectId(report.quizId),
        user: new ObjectId(req?.user?._id),
      })
        .populate("user course")
        .exec();
      report = {
        ...report.toObject(),
        quiz: quiz || null,
        certificate: certificate || null,
      };
    }

    ReqLogger(req, "info", "Results successfully retrieved.");
    return res.status(200).json({
      status: "success",
      message: "Results successfully retrieved.",
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getResultByQuizId = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const report = await Report.find({
      quizId,
      // ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!report) {
      ReqLogger(req, "error", "No report is available.");
      return res.status(404).json({
        message: "No report is available.",
        success: false,
      });
    }

    ReqLogger(req, "info", "Results successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Result successfully retrieved.",
      data: report,
    });
  } catch (error) {
    console.log("error-------->", error);
    return next(error);
  }
};

exports.getUserQuizReports = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Fetch and transform quiz report data
    const quizData = await getQuizData(userId);

    // Return the transformed quiz report data
    return res.status(httpStatus.OK).json({
      message: "Quiz reports fetched successfully",
      data: quizData,
    });
  } catch (error) {
    // Handle errors and send an error response
    return next(
      new APIError({
        message:
          error.message || "An error occurred while fetching quiz reports",
        status: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      })
    );
  }
};

exports.getUserQuizReportAttempts = async (req, res, next) => {
  try {
    const { page = 1, limit = 5, status } = req?.query;
    const userId = req.user._id;

    let queryFilter = {
      userId,
      isDeleted: false,
    };

    if (status === "pass") {
      queryFilter = {
        ...queryFilter,
        $expr: {
          $gte: ["$score", { $multiply: ["$totalScore", 0.5] }],
        },
      };
    }

    if (status === "fail") {
      queryFilter = {
        ...queryFilter,
        $expr: {
          $lt: ["$score", { $multiply: ["$totalScore", 0.5] }],
        },
      };
    }

    const reports = await Report.find({
      ...queryFilter,
    })
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .exec();

    const totalCount = await Report.countDocuments({
      ...queryFilter,
    });

    const quizData = await Promise.all(
      reports.map(async (report) => transformQuizData(report))
    );

    // Return the transformed quiz report data
    return res.status(httpStatus.OK).json({
      message: "Quiz reports attempts fetched successfully",
      data: quizData,
      meta: {
        currentPage: Number(page),
        perPage: limit,
        total: totalCount,
      },
    });
  } catch (error) {
    // Handle errors and send an error response
    return next(
      new APIError({
        message:
          error.message || "An error occurred while fetching quiz reports",
        status: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      })
    );
  }
};

const getQuizData = async (userId) => {
  try {
    const reports = await Report.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          isDeleted: false,
          // ...(isSuperAdmin ? {} : { organization: new ObjectId(organization) }),
        },
      },
      {
        $sort: { quizId: 1, createdAt: -1 }, // Sort by quizId and then by createdAt descending
      },
      {
        $group: {
          _id: "$quizId", // Group by quizId
          latestReport: { $first: "$$ROOT" }, // Pick the first document in the sorted order
        },
      },
      {
        $replaceRoot: { newRoot: "$latestReport" }, // Replace the root document with the latestReport
      },
    ]).exec();

    const quizData = await Promise.all(
      reports.map(async (report) => transformQuizData(report))
    );

    return quizData;
  } catch (error) {
    console.log("error------->", error);
    throw new APIError({
      message: "Error fetching quiz data",
      status: httpStatus.INTERNAL_SERVER_ERROR,
    });
  }
};

const transformQuizData = async (report) => {
  const quizDocument = await Quiz.findOne({
    _id: report.quizId,
    isPublished: true,
  }).exec();

  const transformed = {
    report: {
      _id: report._id,
      reportId: report?.reportId,
      icon: `https://via.placeholder.com/40?text=${
        quizDocument?.quizId || report.quizId
      }`,
      scorePercentage: ((report.score / report.totalScore) * 100).toFixed(0),
      score: report.score,
      totalScore: report.totalScore,
      result: report.score >= report.totalScore * 0.5 ? "Pass" : "Fail",
      timeTaken: getTimeTaken(report),
      quizId: quizDocument?.quizId,
    },
    ...quizDocument?.toObject(),
  };

  return transformed;
};

const getTimeTaken = (report) => {
  const timeDifference =
    new Date(report.quizEnded) - new Date(report.quizStarted); // Time difference in milliseconds
  const minutes = Math.floor(timeDifference / 60000);
  const seconds = ((timeDifference % 60000) / 1000).toFixed(0);
  return `${minutes} min ${seconds < 10 ? "0" : ""}${seconds} sec`;
};
