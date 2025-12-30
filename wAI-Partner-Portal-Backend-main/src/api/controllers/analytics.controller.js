/* eslint-disable comma-dangle */
const Purchase = require("../models/purchase.model");
const Course = require("../models/course.model");
const User = require("../models/user.model");
const Report = require("../models/report.model");
const Certificate = require("../models/certificate.model");
const { ObjectId } = require("mongodb");
const { isSuperAdminUser } = require("../utils");

// Controller function to get analytics
async function getAnalytics(req, res) {
  try {
    const { organization, role } = req.user;

    let totalCourses = 0;
    let totalUsers = 0;
    let totalPurchasedCourses = 0;
    let totalRevenue = 0;
    let topPurchasedCourses = [];
    if (organization !== null && role !== "super-admin") {
      totalCourses = await Course.countDocuments({
        organization: new ObjectId(organization),
      });

      totalUsers = await User.countDocuments({
        role: "user",
        organization: new ObjectId(organization),
      });

      totalPurchasedCourses = await Purchase.distinct("courseId", {
        hasPurchased: true,
      }).countDocuments({ organization: new ObjectId(organization) });
      totalRevenue = await Purchase.aggregate([
        {
          $match: {
            hasPurchased: true,
            organization: new ObjectId(organization),
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);
      // topPurchasedCourses
      topPurchasedCourses = await Purchase.aggregate([
        {
          $match: {
            hasPurchased: true,
            organization: new ObjectId(organization),
          },
        },
        {
          $group: {
            _id: "$courseId",
            totalPurchases: { $sum: 1 },
          },
        },
        {
          $sort: { totalPurchases: -1 },
        },
        {
          $limit: 3,
        },
        {
          $lookup: {
            from: "courses",
            localField: "course._id",
            foreignField: "course.courseId",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 0,
            courseId: "$course.courseId",
            courseName: "$course.courseName",
            courseLectures: "$course.lectures",
            coursePrice: "$course.coursePrice",
            totalPurchases: 1,
          },
        },
      ]);
    } else {
      totalCourses = await Course.countDocuments();

      totalUsers = await User.countDocuments({ role: "user" });

      totalPurchasedCourses = await Purchase.distinct("courseId", {
        hasPurchased: true,
      }).countDocuments();
      totalRevenue = await Purchase.aggregate([
        {
          $match: {
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
      topPurchasedCourses = await Purchase.aggregate([
        {
          $match: {
            hasPurchased: true,
          },
        },
        {
          $group: {
            _id: "$courseId",
            totalPurchases: { $sum: 1 },
          },
        },
        {
          $sort: { totalPurchases: -1 },
        },
        {
          $limit: 3,
        },
        {
          $lookup: {
            from: "courses",
            localField: "course._id",
            foreignField: "course.courseId",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 0,
            courseId: "$course.courseId",
            courseName: "$course.courseName",
            courseLectures: "$course.lectures",
            coursePrice: "$course.coursePrice",
            totalPurchases: 1,
          },
        },
      ]);
    }

    const revenueGenerated =
      totalRevenue.length > 0 ? totalRevenue[0].totalAmount : 0;

    const limitedTopPurchasedCourses = topPurchasedCourses.slice(0, 3);

    const analytics = {
      totalCourses,
      totalPurchasedCourses,
      revenueGenerated,
      totalUsers,
      topPurchasedCourses: limitedTopPurchasedCourses,
    };

    res.status(200).json({ data: analytics });
  } catch (error) {
    console.error("Error retrieving analytics:", error);
    res.status(500).json({ error: "Failed to retrieve analytics" });
  }
}

async function getRevenueByTime(req, res) {
  try {
    let revenue;
    const { organization, role } = req.user;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(
      currentYear,
      currentDate.getMonth(),
      currentDate.getDate(),
      23,
      59,
      59,
      999
    );

    if (organization !== null && role !== "super-admin") {
      revenue = await Purchase.aggregate([
        {
          $match: {
            hasPurchased: true,
            organization: new ObjectId(organization),
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            totalAmount: { $sum: "$amount" },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);
    } else {
      revenue = await Purchase.aggregate([
        {
          $match: {
            hasPurchased: true,
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            totalAmount: { $sum: "$amount" },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);
    }

    const revenueData = [];
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    // Populate revenue data for all months
    for (let i = 1; i <= 12; i++) {
      const monthRevenue = revenue.find((data) => data._id === i);
      const totalAmount = monthRevenue ? monthRevenue.totalAmount : 0;

      revenueData.push({
        month: monthNames[i - 1],
        totalAmount,
      });
    }

    res.status(200).json({ data: revenueData });
  } catch (error) {
    console.error("Error retrieving revenue:", error);
    res.status(500).json({ error: "Failed to retrieve revenue" });
  }
}

const formatTimeDuration = (milliseconds) => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);

  const formattedTime = [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");

  return formattedTime;
};

async function getUsersWithPurchasedCourses(req, res) {
  try {
    const { page, limit } = req.query;

    const user = req.user;

    console.log("user: " + user);

    console.log("page: " + page);
    console.log("limit: " + limit);
    let users = [];
    let totalCount = 0;
    if (user.organization !== null && user?.role !== "super-admin") {
      users = await User.find({
        role: "user",
        organization: user?.organization,
      })
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .limit(Number(limit));
      totalCount = users?.length;
    } else {
      users = await User.find({
        role: "user",
      })
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .limit(Number(limit));
      totalCount = users.length;
    }

    let purchases = [];

    if (user?.organization !== null && user?.role !== "super-admin") {
      purchases = await Purchase.find({
        hasPurchased: true,
        organization: user?.organization,
      });
    } else {
      purchases = await Purchase.find({ hasPurchased: true });
    }

    const usersWithCourses = users.map((user) => {
      const { _id, name, email, lastLogin } = user;

      const userPurchases = purchases.filter((purchase) =>
        purchase.user.equals(user._id)
      );

      if (userPurchases.length === 0) {
        return {
          _id,
          name,
          email,
          lastLogin,
          purchasedCourses: [],
        };
      } else {
        const purchasedCourseIds = userPurchases.map(
          (purchase) => purchase.course.courseName
        );

        console.log(purchasedCourseIds);

        return {
          _id,
          name,
          email,
          lastLogin,
          purchasedCourses: purchasedCourseIds,
        };
      }
    });

    console.log("total count--------->", usersWithCourses);

    res.status(200).json({
      users: usersWithCourses,
      totalCount: totalCount,
    });
  } catch (error) {
    console.error("Error retrieving users with purchased courses:", error);
    res
      .status(500)
      .json({ error: "Failed to retrieve users with purchased courses" });
  }
}

async function calculateQuizAnalytics(req, res) {
  const { quizId } = req.params;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    const totalAttempts = await Report.countDocuments({
      quizId: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    const averageTimeTaken = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $group: {
          _id: "$quizId",
          averageTimeTaken: {
            $avg: { $subtract: ["$quizEnded", "$quizStarted"] },
          },
        },
      },
    ]);
    const sumScoresResult = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $group: {
          _id: "$quizId",
          totalObtainedScores: { $sum: "$score" },
          totalScore: { $max: "$totalScore" },
        },
      },
    ]);

    const totalObatinedScores = sumScoresResult[0]?.totalObtainedScores || 0;
    const totalScores = sumScoresResult[0]?.totalScore || 0;
    const averageScore = (
      ((totalObatinedScores / totalAttempts) * 100) / totalScores || 0
    ).toFixed(2);

    const medianScore = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      { $sort: { score: 1 } }, // Sort scores first
      {
        $group: {
          _id: "$quizId",
          scores: { $push: "$score" },
          totalScore: { $max: "$totalScore" },
          count: { $sum: 1 },
        },
      },
      { $unwind: { path: "$scores", includeArrayIndex: "index" } },
      {
        $project: {
          score: "$scores",
          index: "$index",
          count: "$count",
          totalScore: "$totalScore",
          midPoint: { $floor: { $divide: ["$count", 2] } },
          isEven: { $eq: [{ $mod: ["$count", 2] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ["$index", "$midPoint"] },
              {
                $and: [
                  { $eq: ["$isEven", true] },
                  { $eq: ["$index", { $subtract: ["$midPoint", 1] }] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$quizId",
          medianScore: { $avg: "$score" },
          totalScore: { $first: "$totalScore" },
        },
      },
      {
        $project: {
          _id: 0,
          medianScore: 1,
          medianScorePercentage: {
            $multiply: [{ $divide: ["$medianScore", "$totalScore"] }, 100],
          },
        },
      },
    ]);

    const analytics = {
      totalAttempts,
      averageTimeTaken: averageTimeTaken?.length
        ? formatTimeDuration(averageTimeTaken[0]?.averageTimeTaken)
        : 0,
      averageScore: averageScore || 0,
      medianScore: medianScore[0]?.medianScore || 0,
    };

    res.status(200).json({ data: analytics });
  } catch (error) {
    console.error("Error calculating quiz analytics:", error);
    res
      .status(500)
      .json({ error: "An error occurred while calculating quiz analytics" });
  }
}

async function generateQuizPieChart(req, res) {
  const { quizId } = req.params;
  const { startDate, endDate } = req.query;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const dateRangeCondition =
      startDate || endDate ? { createdAt: dateFilter } : {};

    const totalAttempts = await Report.countDocuments({
      quizId: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      ...dateRangeCondition,
    });

    const passingAttempts = await Report.countDocuments({
      quizId: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      ...dateRangeCondition,
      $expr: {
        $gte: [
          { $multiply: [{ $divide: ["$score", "$totalScore"] }, 100] },
          70,
        ],
      },
    });

    const pieChartData = {
      passedAttempts: passingAttempts,
      failedAttempts: totalAttempts - passingAttempts,
      totalAttempts,
    };

    return res.status(200).json({ data: pieChartData });
  } catch (error) {
    console.error("Error generating pie chart data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating pie chart data" });
  }
}

async function getQuizAttemptsByMonth(req, res) {
  const { quizId } = req.params;
  const { startDate, endDate } = req.query;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Get an array of months from January to the current month
    const monthsInYear = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const start = startDate
      ? new Date(startDate)
      : new Date(`${new Date().getFullYear()}-01-01`);
    const end = endDate
      ? new Date(endDate)
      : new Date(`${new Date().getFullYear() + 1}-01-01`);

    const monthsInRange = [];
    let current = new Date(start);
    while (current < end) {
      monthsInRange.push({
        month: current.toLocaleString("default", { month: "long" }),
        count: 0,
      });
      current.setMonth(current.getMonth() + 1);
    }

    const quizAttempts = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
          createdAt: {
            $gte: new Date(start),
            $lt: new Date(end),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
        },
      },
    ]);

    quizAttempts.forEach((attempt) => {
      const monthIndex = attempt._id - 1;
      const dataMonth = monthsInYear[monthIndex];
      const idx = monthsInRange?.findIndex(
        (month) => month?.month === dataMonth
      );
      monthsInRange[idx].count = attempt.count;
    });

    res.status(200).json({ data: monthsInRange });
  } catch (error) {
    console.error("Error retrieving quiz attempts by month:", error);
    res.status(500).json({
      error: "An error occurred while retrieving quiz attempts by month",
    });
  }
}

async function getQuizCohortStatistics(req, res) {
  const { quizId } = req.params;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Total number of users
    const totalUsers = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      { $group: { _id: "$userId" } },
      { $group: { _id: null, count: { $sum: 1 } } },
      { $project: { _id: 0, count: 1 } },
    ]);

    // Highest score
    const highestScore = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          maxScore: { $max: "$score" },
          totalScore: { $max: "$totalScore" },
        },
      },
      {
        $project: {
          _id: 0,
          maxScore: {
            $multiply: [{ $divide: ["$maxScore", "$totalScore"] }, 100],
          },
        },
      },
    ]);
    // Lowest score
    const lowestScore = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          minScore: { $min: "$score" },
          totalScore: { $max: "$totalScore" },
        },
      },
      {
        $project: {
          _id: 0,
          minScore: {
            $multiply: [{ $divide: ["$minScore", "$totalScore"] }, 100],
          },
        },
      },
    ]);

    // Average score
    const totalAttempts = await Report.countDocuments({
      quizId: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    const sumScoresResult = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $group: {
          _id: "$quizId",
          totalObtainedScores: { $sum: "$score" },
          totalScore: { $max: "$totalScore" },
        },
      },
    ]);

    const medianScore = await Report.aggregate([
      {
        $match: {
          quizId: new ObjectId(quizId),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      { $sort: { score: 1 } },
      {
        $group: {
          _id: null,
          scores: { $push: "$score" },
          count: { $sum: 1 },
        },
      },
      { $unwind: { path: "$scores", includeArrayIndex: "index" } },
      {
        $project: {
          score: "$scores",
          index: "$index",
          count: "$count",
          midPoint: { $floor: { $divide: ["$count", 2] } },
          isEven: { $eq: [{ $mod: ["$count", 2] }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ["$index", "$midPoint"] },
              {
                $and: [
                  { $eq: ["$isEven", true] },
                  { $eq: ["$index", { $subtract: ["$midPoint", 1] }] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          medianScore: { $avg: "$score" },
        },
      },
    ]);

    const totalObatinedScores = sumScoresResult[0]?.totalObtainedScores || 0;
    const totalScores = sumScoresResult[0]?.totalScore || 0;
    const averageScore =
      ((totalObatinedScores / totalAttempts) * 100) / totalScores;
    // Format the scores as percentages
    const formatPercentage = (score) => `${score.toFixed(2)}%`;

    // Construct the statistics object
    const quizStatistics = {
      totalUsers: totalUsers.length > 0 ? totalUsers[0].count : 0,
      highestScore: formatPercentage(highestScore[0]?.maxScore || 0),
      lowestScore: formatPercentage(lowestScore[0]?.minScore || 0),
      averageScore: formatPercentage(averageScore || 0),
      medianScore: medianScore?.length ? medianScore?.[0]?.medianScore : 0,
    };

    res.status(200).json({ data: quizStatistics });
  } catch (error) {
    console.error("Error retrieving quiz statistics:", error);
    res
      .status(500)
      .json({ error: "An error occurred while retrieving quiz statistics" });
  }
}

async function getQuizReportList(req, res) {
  const { quizId } = req.params;
  const { search } = req.query;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Build the base query
    let query = {
      quizId: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    };

    // If search term exists, add it to the pipeline using aggregation
    const reports = await Report.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: "$userDetails",
      },
      // Add search filter if search term exists
      ...(search
        ? [
            {
              $match: {
                "userDetails.name": {
                  $regex: new RegExp(search, "i"), // Case-insensitive search
                },
              },
            },
          ]
        : []),
      {
        $project: {
          reportId: "$_id",
          score: 1,
          totalScore: 1,
          quizStarted: 1,
          quizEnded: 1,
          "userId.name": "$userDetails.name",
          "userId.email": "$userDetails.email",
        },
      },
    ]);

    // Format the scores as percentages
    const formatPercentage = (score, totalScore) =>
      `${((score / totalScore) * 100).toFixed(2)}%`;

    // Add additional fields and format the results
    const formattedReports = reports.map((report) => ({
      userName: report.userId.name,
      userEmail: report.userId.email,
      reportId: report.reportId,
      score: formatPercentage(report.score, report.totalScore),
      timeTaken: formatTimeDuration(report.quizEnded - report.quizStarted),
      result: (report.score / report.totalScore) * 100 >= 70 ? "Pass" : "Fail",
    }));

    res.status(200).json({
      data: formattedReports,
      total: formattedReports.length,
    });
  } catch (error) {
    console.error("Error retrieving quiz report list:", error);
    res.status(500).json({
      error: "An error occurred while retrieving the quiz report list",
    });
  }
}

const getCoursePurchases = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Find purchases for the specified courseId
    const purchases = await Purchase.find({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("user", "email name")
      .exec();

    const purchaseDetails = await Promise.all(
      purchases.map(async (purchase) => {
        try {
          const { user = {}, courseProgress = 0 } = purchase;
          const completionStatus =
            courseProgress === 100 ? "Completed" : "Incomplete";
          let certificateId = null;
          // If the course is completed, attempt to find the certificate
          if (completionStatus === "Completed") {
            const certificate = await Certificate.findOne({
              user: user._id,
              course: new ObjectId(courseId),
              organization: purchase?.organization,
            }).exec();

            console.log(certificate);
            if (certificate) {
              certificateId = certificate.certificateId;
            }
          }
          return {
            email: user?.email || "N/A",
            name: user?.name || "N/A",
            courseProgress: courseProgress || 0,
            completionStatus,
            certificateId,
          };
        } catch (err) {
          console.error("Error processing purchase:", err);
          return {
            email: "Error processing",
            name: "Error processing",
            courseProgress: 0,
            completionStatus: "Error",
            certificateId: null,
          };
        }
      })
    );

    return res.status(200).json({ data: purchaseDetails });
  } catch (error) {
    console.error("Error retrieving course purchases:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve course purchases",
      error: error.message || "Unknown error occurred",
    });
  }
};

const getCourseStats = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Calculate total purchases of the course
    const totalPurchases = await Purchase.countDocuments({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    // Calculate average course completion
    const purchases = await Purchase.find({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    const totalCompletion = purchases.reduce(
      (sum, purchase) => sum + purchase.courseProgress,
      0
    );
    const averageCompletion =
      purchases.length > 0 ? totalCompletion / purchases.length : 0;

    return res.status(200).json({
      totalPurchases,
      averageCompletion,
    });
  } catch (error) {
    console.error("Error retrieving course stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getUsersCountByProgressRange = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    const userCounts = Array.from({ length: 10 }, () => 0);
    const rangeLabels = Array.from(
      { length: 10 },
      (_, i) => `${i * 10}-${i * 10 + 10}`
    ); // Generate range labels

    const courses = await Purchase.find({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).select("courseProgress");

    courses.forEach((course) => {
      const progress = course.courseProgress;
      if (progress >= 0 && progress <= 100) {
        let index;
        if (progress === 100) {
          index = 9;
        } else {
          index = Math.floor(progress / 10);
        }
        userCounts[index]++;
      }
    });

    const result = rangeLabels.map((label, index) => ({
      range: label,
      count: userCounts[index],
    }));

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Error retrieving user counts by progress range:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getCompletionStatus = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    // Count completed purchases
    const completedCount = await Purchase.countDocuments({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      courseProgress: 100,
    });

    // Count not completed purchases
    const notCompletedCount = await Purchase.countDocuments({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      courseProgress: { $ne: 100 },
    });

    return res.status(200).json({
  courseId,
  courseName: course?.courseName || "Course",
  users,
  summary: {
    totalUsers,
    completedUsers,
    incompleteUsers,
    completedPercent: parseFloat(completedPercent.toFixed(2)),
    incompletePercent: parseFloat(incompletePercent.toFixed(2)),
  },
});

  } catch (error) {
    console.error("Error retrieving completion status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getUserCourseProgressWithStats = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    const purchases = await Purchase.find({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("user", "name email")
      .select("courseProgress user");

    const users = purchases.map((purchase) => ({
      name: purchase.user?.name || "Unknown",
      email: purchase.user?.email || "-",
      completion: purchase.courseProgress || 0,
    }));

    const totalUsers = users.length;
    const completedUsers = users.filter((u) => u.completion === 100).length;
    const incompleteUsers = totalUsers - completedUsers;
    const completedPercent = totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0;
    const incompletePercent = 100 - completedPercent;

    return res.status(200).json({
      courseId,
      users,
      summary: {
        totalUsers,
        completedUsers,
        incompleteUsers,
        completedPercent: parseFloat(completedPercent.toFixed(2)),
        incompletePercent: parseFloat(incompletePercent.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error retrieving user course progress with stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getCourseAnalytics = async (req, res) => {
  const courseId = req.params.courseId;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);
  console.log("API HIT ✅ courseId:", courseId);

  try {
    const purchases = await Purchase.find({
      course: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("user", "name email")
      .populate({
        path: "course",
        select: "courseName lectures", // populate lectures to get total count
      })
      .exec();

    const users = await Promise.all(
      purchases.map(async (purchase) => {
        const { user = {}, lectures = [], course } = purchase;

        // Calculate completed lectures
        const completedLectures = lectures.filter(
          (lec) => lec.progress === 100
        ).length;

        const totalLectures = course?.lectures?.length || 0;
        const courseProgress =
          totalLectures > 0
            ? Math.round((completedLectures / totalLectures) * 100)
            : 0;

        const status = courseProgress === 100 ? "Completed" : "Incomplete";

        let certificateId = null;
        if (status === "Completed") {
          const certificate = await Certificate.findOne({
            user: user._id,
            course: new ObjectId(courseId),
            organization: purchase.organization,
          });
          if (certificate) certificateId = certificate.certificateId;
        }

        return {
          userId: user._id,
          name: user.name || "N/A",
          email: user.email || "N/A",
          lectures,
          course: {
            lectures: course?.lectures,
          },
          courseProgress, // ✅ Injected here
          status,
          certificateId,
        };
      })
    );

    const courseName = purchases?.[0]?.course?.courseName || "Course";

    const totalUsers = users.length;
    const completedUsers = users.filter((u) => u.courseProgress === 100).length;
    const incompleteUsers = totalUsers - completedUsers;
    const completedPercent =
      totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0;
    const incompletePercent = 100 - completedPercent;

    return res.status(200).json({
      courseId,
      courseName,
      users,
      summary: {
        totalUsers,
        completedUsers,
        incompleteUsers,
        completedPercent: parseFloat(completedPercent.toFixed(2)),
        incompletePercent: parseFloat(incompletePercent.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error in getCourseAnalytics:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

async function getAnalyticsByOrganization(req, res) {
  const { organizationId } = req.params; // Assuming you pass the organizationId in the query params.

  try {
    // Total number of courses
    const totalCourses = await Course.countDocuments({
      organization: new ObjectId(organizationId),
    });

    // Total number of users for the specific organization
    const totalUsers = await User.countDocuments({
      role: "user",
      organization: new ObjectId(organizationId),
    });

    // Total purchased courses for the specific organization
    const totalPurchasedCourses = await Purchase.distinct("courseId", {
      hasPurchased: true,
      organization: new ObjectId(organizationId),
    }).countDocuments();

    // Total revenue generated for the specific organization
    const totalRevenue = await Purchase.aggregate([
      {
        $match: {
          hasPurchased: true,
          organization: new ObjectId(organizationId),
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const revenueGenerated =
      totalRevenue.length > 0 ? totalRevenue[0].totalAmount : 0;

    // Top purchased courses for the specific organization
    const topPurchasedCourses = await Purchase.aggregate([
      {
        $match: {
          hasPurchased: true,
          organization: new ObjectId(organizationId),
        },
      },
      {
        $group: {
          _id: "$courseId",
          totalPurchases: { $sum: 1 },
        },
      },
      {
        $sort: { totalPurchases: -1 },
      },
      {
        $limit: 3,
      },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "course",
        },
      },
      {
        $unwind: "$course",
      },
      {
        $project: {
          _id: 0,
          courseId: "$course._id",
          courseName: "$course.courseName",
          courseLectures: "$course.lectures",
          coursePrice: "$course.coursePrice",
          totalPurchases: 1,
        },
      },
    ]);

    const limitedTopPurchasedCourses = topPurchasedCourses.slice(0, 3);

    // Construct the statistics object
    const analytics = {
      totalCourses,
      totalPurchasedCourses,
      revenueGenerated,
      totalUsers,
      topPurchasedCourses: limitedTopPurchasedCourses,
    };

    res.status(200).json({ data: analytics });
  } catch (error) {
    console.error("Error retrieving analytics:", error);
    res.status(500).json({ error: "Failed to retrieve analytics" });
  }
}

async function getRevenueByTimeForOrganziation(req, res) {
  const { organizationId } = req.params; // Assuming you pass the organizationId in the query params.

  try {
    let revenue;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(
      currentYear,
      currentDate.getMonth(),
      currentDate.getDate(),
      23,
      59,
      59,
      999
    );

    // Calculate revenue for all months in the current year for the specific organization
    revenue = await Purchase.aggregate([
      {
        $match: {
          hasPurchased: true,
          organization: new ObjectId(organizationId),
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    const revenueData = [];
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    // Populate revenue data for all months
    for (let i = 1; i <= 12; i++) {
      const monthRevenue = revenue.find((data) => data._id === i);
      const totalAmount = monthRevenue ? monthRevenue.totalAmount : 0;

      revenueData.push({
        month: monthNames[i - 1],
        totalAmount,
      });
    }

    res.status(200).json({ data: revenueData });
  } catch (error) {
    console.error("Error retrieving revenue:", error);
    res.status(500).json({ error: "Failed to retrieve revenue" });
  }
}

async function getUsersWithPurchasedCoursesByOrganization(req, res) {
  const { organizationId } = req.params; // Assuming you pass the organizationId as a parameter.

  try {
    const { page, limit } = req.query;

    console.log("page: " + page);
    console.log("limit: " + limit);
    const users = await User.find({
      role: "user",
      organization: new ObjectId(organizationId),
    })
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    // Fetch total count for pagination
    const totalCount = await User.countDocuments({
      role: "user",
      organization: new ObjectId(organizationId),
    });

    const purchases = await Purchase.find({
      hasPurchased: true,
      organization: new ObjectId(organizationId),
    });

    const usersWithCourses = users.map((user) => {
      const { _id, name, email, lastLogin } = user;

      const userPurchases = purchases.filter((purchase) =>
        purchase.user.equals(user._id)
      );

      if (userPurchases.length === 0) {
        return {
          _id,
          name,
          email,
          lastLogin,
          purchasedCourses: [],
        };
      } else {
        const purchasedCourseNames = userPurchases.map(
          (purchase) => purchase.course.courseName
        );

        console.log(purchasedCourseNames);

        return {
          _id,
          name,
          email,
          lastLogin,
          purchasedCourses: purchasedCourseNames,
        };
      }
    });

    res.status(200).json({
      users: usersWithCourses,
      totalCount: totalCount,
    });
  } catch (error) {
    console.error("Error retrieving users with purchased courses:", error);
    res
      .status(500)
      .json({ error: "Failed to retrieve users with purchased courses" });
  }
}

module.exports = {
  generateQuizPieChart,
  getQuizAttemptsByMonth,
  getQuizCohortStatistics,
  getQuizReportList,
  getCoursePurchases,
  getUsersCountByProgressRange,
  getCourseStats,
  getCompletionStatus,
  getUserCourseProgressWithStats,
  getCourseAnalytics,
  getAnalyticsByOrganization,
  getRevenueByTimeForOrganziation,
  getUsersWithPurchasedCoursesByOrganization,
  getAnalytics,
  getRevenueByTime,
  getUsersWithPurchasedCourses,
  calculateQuizAnalytics,
};
