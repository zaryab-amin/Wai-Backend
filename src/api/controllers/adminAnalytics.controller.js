const httpStatus = require("http-status");
const Purchase = require("../models/purchase.model");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const Course = require("../models/course.model");
const Quiz = require("../models/quiz.model");
const User = require("../models/user.model");
const { ObjectId } = require("mongodb");
const { isSuperAdminUser, isPrescientAdminUser } = require("../utils");

exports.getUserRevenueStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const isPrescientAdmin = isPrescientAdminUser(req?.user);
    // First get all courses and quizzes created by this user
    const userCourses = await Course.find({
      // created_by: userId,
      ...(!isPrescientAdmin
        ? { organization: new ObjectId(organization) }
        : {}),
      isDeleted: false,
    }).select("_id");

    const userQuizzes = await Quiz.find({
      // created_by: userId,
      ...(!isPrescientAdmin
        ? { organization: new ObjectId(organization) }
        : {}),
      isDeleted: false,
    }).select("_id");

    const userCourseIds = userCourses.map((course) => course._id);
    const userQuizIds = userQuizzes.map((quiz) => quiz._id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get current month's revenue stats for user's courses
    const [currentMonthCourses, currentMonthQuizzes] = await Promise.all([
      Purchase.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            hasPurchased: true,
            course: { $in: userCourseIds },
            // ...(!isSuperAdmin
            //   ? { organization: new ObjectId(organization) }
            //   : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      PurchaseQuiz.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            hasPurchased: true,
            quiz: { $in: userQuizIds },
            // ...(!isSuperAdmin
            //   ? { organization: new ObjectId(organization) }
            //   : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Get last month's revenue stats
    const [lastMonthCourses, lastMonthQuizzes] = await Promise.all([
      Purchase.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startOfLastMonth,
              $lt: endOfLastMonth,
            },
            hasPurchased: true,
            course: { $in: userCourseIds },
            // ...(!isSuperAdmin
            //   ? { organization: new ObjectId(organization) }
            //   : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      PurchaseQuiz.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startOfLastMonth,
              $lt: endOfLastMonth,
            },
            hasPurchased: true,
            quiz: { $in: userQuizIds },
            // ...(!isSuperAdmin
            //   ? { organization: new ObjectId(organization) }
            //   : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Get content counts for this user
    const [
      totalCourses,
      totalQuizzes,
      publishedCourses,
      publishedQuizzes,
      courseUsers,
      quizUsers,
      allUsers,
    ] = await Promise.all([
      Purchase.countDocuments({
        hasPurchased: true,
        course: { $in: userCourseIds },
        // created_by: userId,
        // ...(!isSuperAdmin
        //   ? { organization: new ObjectId(organization) }
        //   : {}),
        // isDeleted: false,
      }),
      PurchaseQuiz.countDocuments({
        hasPurchased: true,
        quiz: { $in: userQuizIds },
        // created_by: userId,
        // ...(!isSuperAdmin
        //   ? { organization: new ObjectId(organization) }
        //   : {}),
        // isDeleted: false,
      }),
      Course.countDocuments({
        // created_by: userId,
        ...(!isPrescientAdmin
          ? { organization: new ObjectId(organization) }
          : {}),
        isDeleted: false,
        isPublished: true,
      }),
      Quiz.countDocuments({
        // created_by: userId,
        ...(!isPrescientAdmin
          ? { organization: new ObjectId(organization) }
          : {}),
        isDeleted: false,
        isPublished: true,
      }),
      Purchase.distinct("user", {
        hasPurchased: true,
        course: { $in: userCourseIds },
        // ...(!isSuperAdmin
        //   ? { organization: new ObjectId(organization) }
        //   : {}),
      }),
      PurchaseQuiz.distinct("user", {
        hasPurchased: true,
        quiz: { $in: userQuizIds },
        // ...(!isSuperAdmin
        //   ? { organization: new ObjectId(organization) }
        //   : {}),
      }),
      User.countDocuments({
        // created_by: userId,
        ...(!isPrescientAdmin
          ? { organization: new ObjectId(organization) }
          : {}),
        // isDeleted: false,
        isActivated: true,
      }),
    ]);

    // Calculate totals
    const currentMonthTotal = {
      revenue:
        (currentMonthCourses[0]?.total || 0) +
        (currentMonthQuizzes[0]?.total || 0),
      sales:
        (currentMonthCourses[0]?.count || 0) +
        (currentMonthQuizzes[0]?.count || 0),
    };

    const lastMonthTotal = {
      revenue:
        (lastMonthCourses[0]?.total || 0) + (lastMonthQuizzes[0]?.total || 0),
      sales:
        (lastMonthCourses[0]?.count || 0) + (lastMonthQuizzes[0]?.count || 0),
    };

    // Calculate percentage changes
    const revenuePercentageChange =
      lastMonthTotal.revenue === 0
        ? 0
        : ((currentMonthTotal.revenue - lastMonthTotal.revenue) /
            lastMonthTotal.revenue) *
          100;

    const salesPercentageChange =
      lastMonthTotal.sales === 0
        ? 0
        : ((currentMonthTotal.sales - lastMonthTotal.sales) /
            lastMonthTotal.sales) *
          100;

    // Get daily revenue trend for chart
    const dailyRevenue = await Purchase.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          hasPurchased: true,
          course: { $in: userCourseIds },
          // ...(!isSuperAdmin
          //   ? { organization: new ObjectId(organization) }
          //   : {}),
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$amount" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get daily quiz revenue
    const dailyQuizRevenue = await PurchaseQuiz.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          hasPurchased: true,
          quiz: { $in: userQuizIds },
          // ...(!isSuperAdmin
          //   ? { organization: new ObjectId(organization) }
          //   : {}),
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$amount" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Combine daily revenues from courses and quizzes
    const dailyRevenueMap = new Map();

    [...dailyRevenue, ...dailyQuizRevenue].forEach((item) => {
      const date = item._id;
      dailyRevenueMap.set(date, (dailyRevenueMap.get(date) || 0) + item.amount);
    });

    const combinedDailyRevenue = Array.from(
      dailyRevenueMap,
      ([date, amount]) => ({
        date,
        amount,
      })
    ).sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      data: {
        revenue: {
          currentMonth: {
            amount: currentMonthTotal.revenue,
            formattedAmount: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(currentMonthTotal.revenue),
            percentageChange: parseFloat(revenuePercentageChange.toFixed(1)),
            trend: revenuePercentageChange >= 0 ? "up" : "down",
          },
          dailyTrend: combinedDailyRevenue,
        },
        sales: {
          currentMonth: currentMonthTotal.sales,
          percentageChange: parseFloat(salesPercentageChange.toFixed(1)),
          trend: salesPercentageChange >= 0 ? "up" : "down",
        },
        content: {
          courses: {
            total: totalCourses,
            published: publishedCourses,
            draft: totalCourses - publishedCourses,
          },
          quizzes: {
            total: totalQuizzes,
            published: publishedQuizzes,
            draft: totalQuizzes - publishedQuizzes,
          },
          users: {
            courseUsers: courseUsers.length,
            quizUsers: quizUsers.length,
            totalUsers: allUsers,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPastWeeks = () => {
  const weeks = [];
  for (let i = 6; i >= 0; i--) {
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    weeks.push({ start, end });
  }
  return weeks;
};

const getPast12Months = () => {
  const months = [];
  const currentDate = new Date();

  for (let i = 11; i >= 0; i--) {
    const start = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i,
      1
    );
    const end = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i + 1,
      0
    );
    months.push({ start, end });
  }

  return months;
};

const formatLabel = (date, period) => {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  switch (period) {
    case "weekly":
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + 6);
      return formatWeekRange(date, weekEnd);
    case "monthly":
      return monthNames[date.getMonth()];
    case "yearly":
      return date.getFullYear().toString();
    default:
      return `${monthNames[date.getMonth()]} ${date.getDate()}`;
  }
};

function getWeekNumber(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return weekNumber;
}
function formatWeekRange(start, end) {
  const startMonth = start.toLocaleString("default", { month: "short" });
  const endMonth = end.toLocaleString("default", { month: "short" });
  const startDate = start.getDate();
  const endDate = end.getDate();
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDate}-${endDate}, ${year}`;
  } else {
    return `${startMonth} ${startDate} - ${endMonth} ${endDate}, ${year}`;
  }
}
exports.getEarningsChart = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const period = req.query.period || "monthly";
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const isPrescientAdmin = isPrescientAdminUser(req?.user);

    const userCourses = await Course.find({
      // created_by: userId,
      ...(!isPrescientAdmin
        ? { organization: new ObjectId(organization) }
        : {}),
      isDeleted: false,
    }).select("_id");

    const userQuizzes = await Quiz.find({
      // created_by: userId,
      ...(!isPrescientAdmin
        ? { organization: new ObjectId(organization) }
        : {}),
      isDeleted: false,
    }).select("_id");

    const userCourseIds = userCourses.map((course) => course._id);
    const userQuizIds = userQuizzes.map((quiz) => quiz._id);

    let dateRanges;
    switch (period) {
      case "weekly":
        // First find the earliest transaction date
        const [earliestWeeklyCoursePurchase, earliestWeeklyQuizPurchase] =
          await Promise.all([
            Purchase.findOne({ hasPurchased: true }).sort({ createdAt: 1 }),
            PurchaseQuiz.findOne({ hasPurchased: true }).sort({ createdAt: 1 }),
          ]);

        // Get the earliest date from both purchase types
        const earliestDate = new Date(
          Math.min(
            earliestWeeklyCoursePurchase
              ? earliestWeeklyCoursePurchase.createdAt
              : new Date(),
            earliestWeeklyQuizPurchase
              ? earliestWeeklyQuizPurchase.createdAt
              : new Date()
          )
        );

        // Start from the beginning of the week of the earliest transaction
        const startDate = new Date(earliestDate);
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Go to Sunday
        startDate.setHours(0, 0, 0, 0);

        const currentDate = new Date();
        dateRanges = [];

        // Create ranges for each week from earliest to current
        let weekStart = new Date(startDate);
        while (weekStart <= currentDate) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);

          // If it's the current week, use current date as end
          const end = weekEnd > currentDate ? currentDate : weekEnd;

          dateRanges.push({
            start: new Date(weekStart),
            end: end,
            label: formatWeekRange(weekStart, end),
          });

          // Move to next week
          weekStart = new Date(weekEnd);
          weekStart.setDate(weekStart.getDate() + 1);
          weekStart.setHours(0, 0, 0, 0);
        }
        break;
      case "monthly":
        dateRanges = getPast12Months();
        break;
      case "yearly":
        const currentYear = new Date().getFullYear();

        // First find the earliest transaction date
        const [earliestCoursePurchase, earliestQuizPurchase] =
          await Promise.all([
            Purchase.findOne({ hasPurchased: true }).sort({ createdAt: 1 }),
            PurchaseQuiz.findOne({ hasPurchased: true }).sort({ createdAt: 1 }),
          ]);

        // Get the earliest year from both purchase types
        const earliestCourseYear = earliestCoursePurchase
          ? earliestCoursePurchase.createdAt.getFullYear()
          : currentYear;
        const earliestQuizYear = earliestQuizPurchase
          ? earliestQuizPurchase.createdAt.getFullYear()
          : currentYear;
        const startYear = Math.min(earliestCourseYear, earliestQuizYear);

        // Create date ranges for each year from earliest to current
        dateRanges = [];
        for (let year = startYear; year <= currentYear; year++) {
          dateRanges.push({
            start: new Date(year, 0, 1), // January 1st
            end:
              year === currentYear
                ? new Date() // If current year, use current date
                : new Date(year, 11, 31, 23, 59, 59), // December 31st 23:59:59
            label: year.toString(),
          });
        }
        break;
    }

    const chartData = await Promise.all(
      dateRanges.map(async ({ start, end }) => {
        const [courseEarnings, quizEarnings] = await Promise.all([
          Purchase.aggregate([
            {
              $match: {
                createdAt: { $gte: start, $lte: end },
                course: { $in: userCourseIds },
                hasPurchased: true,
                // ...(!isSuperAdmin
                //   ? { organization: new ObjectId(organization) }
                //   : {}),
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
              },
            },
          ]),
          PurchaseQuiz.aggregate([
            {
              $match: {
                createdAt: { $gte: start, $lte: end },
                quiz: { $in: userQuizIds },
                hasPurchased: true,
                // ...(!isSuperAdmin
                //   ? { organization: new ObjectId(organization) }
                //   : {}),
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
              },
            },
          ]),
        ]);

        return {
          date: start.toISOString().split("T")[0],
          label: formatLabel(start, period),
          courses: courseEarnings[0]?.total || 0,
          quizzes: quizEarnings[0]?.total || 0,
        };
      })
    );

    const totalEarnings = chartData.reduce(
      (sum, item) => sum + item.courses + item.quizzes,
      0
    );

    return res.json({
      success: true,
      data: {
        totalEarnings,
        formattedTotalEarnings: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(totalEarnings),
        chartData,
        period,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserTopSales = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isPrescientAdmin = isPrescientAdminUser(req?.user);

    // Get top selling courses created by the user
    const topCourses = await Purchase.aggregate([
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseDetails",
        },
      },
      {
        $unwind: "$courseDetails",
      },
      {
        $lookup: {
          from: "organizations", // Organization collection
          localField: "organization", // Organization ID in Purchase
          foreignField: "_id", // ID in Organization collection
          as: "organizationDetails",
        },
      },
      {
        $unwind: {
          path: "$organizationDetails",
        },
      },
      {
        $match: {
          // ...(!isSuperAdmin
          //   ? { organization: new ObjectId(organization) }
          //   : {})
          // ,
          hasPurchased: true,
          ...(!isPrescientAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
          "courseDetails.isDeleted": false,
        },
      },
      {
        $group: {
          _id: "$course",
          totalSales: { $sum: "$amount" },
          salesCount: { $sum: 1 },
          courseDetails: { $first: "$courseDetails" },
          organizationName: { $first: "$organizationDetails.name" },
        },
      },
      {
        $project: {
          name: "$courseDetails.courseName",
          sales: "$salesCount",
          amount: "$totalSales",
          image: "$courseDetails.courseImage",
          organizationName: "$organizationName",
        },
      },
      {
        $sort: { amount: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    // Get top selling quizzes created by the user
    const topQuizzes = await PurchaseQuiz.aggregate([
      {
        $lookup: {
          from: "quizzes",
          localField: "quiz",
          foreignField: "_id",
          as: "quizDetails",
        },
      },
      {
        $unwind: "$quizDetails",
      },
      {
        $lookup: {
          from: "organizations", // Organization collection
          localField: "organization", // Organization ID in Purchase
          foreignField: "_id", // ID in Organization collection
          as: "organizationDetails",
        },
      },
      {
        $unwind: {
          path: "$organizationDetails",
        },
      },
      {
        $match: {
          // ...(!isSuperAdmin
          //   ? { organization: new ObjectId(organization) }
          //   : {})
          // ,
          hasPurchased: true,
          ...(!isPrescientAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
          "quizDetails.isDeleted": false,
        },
      },
      {
        $group: {
          _id: "$quiz",
          totalSales: { $sum: "$amount" },
          salesCount: { $sum: 1 },
          quizDetails: { $first: "$quizDetails" },
          organizationName: { $first: "$organizationDetails.name" },
        },
      },
      {
        $project: {
          name: "$quizDetails.name",
          sales: "$salesCount",
          amount: "$totalSales",
          image: "$quizDetails.quizImage",
          organizationName: "$organizationName",
        },
      },
      {
        $sort: { amount: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    return res.json({
      success: true,
      data: {
        topCourses: topCourses.map((course) => ({
          name: course.name,
          sales: `${course.sales} Sales`,
          amount: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
          }).format(course.amount),
          image: course.image || null,
          organizationName: course?.organizationName,
        })),
        topQuizzes: topQuizzes.map((quiz) => ({
          name: quiz.name,
          sales: `${quiz.sales} Sales`,
          amount: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
          }).format(quiz.amount),
          image: quiz.image || null,
          organizationName: quiz?.organizationName,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
