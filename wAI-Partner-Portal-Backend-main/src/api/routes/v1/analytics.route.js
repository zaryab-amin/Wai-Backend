/* eslint-disable quotes */
const express = require("express");
const { authorize, ADMIN, SUPER_ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");
const {
  getAnalytics,
  getTopPurchasedCourses,
  getRevenueByTime,
  getUsersWithPurchasedCourses,
  calculateQuizAnalytics,
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
  getRevenueByTimeForOrganziation,
  getUsersWithPurchasedCoursesByOrganization,
  getAnalyticsByOrganization,
} = require("../../controllers/analytics.controller");

const router = express.Router();

// GET /
router.get("/", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), getAnalytics);

// GET /get-users
router.get(
  "/get-users",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getUsersWithPurchasedCourses
);

// GET /revenue
router.get("/revenue", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), getRevenueByTime);

// GET /
router.get("/organization/:organizationId", getAnalyticsByOrganization);

// GET /get-users
router.get(
  "/get-users/organization/:organizationId",
  getUsersWithPurchasedCoursesByOrganization
);

// GET /revenue
router.get(
  "/revenue/organization/:organizationId",
  getRevenueByTimeForOrganziation
);

// GET /get-quiz-stats/:quizId
router.get(
  "/get-quiz-stats/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  calculateQuizAnalytics
);

// GET /get-quiz-pie-chart/:quizId
router.get(
  "/get-quiz-pie-chart/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  generateQuizPieChart
);

// GET /get-quiz-attempts/:quizId
router.get(
  "/get-quiz-attempts/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getQuizAttemptsByMonth
);

// GET /get-quiz-attempts/:quizId
router.get(
  "/get-quiz-cohort-stats/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getQuizCohortStatistics
);

// GET /get-quiz-attempts/:quizId
router.get(
  "/get-quiz-reports/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getQuizReportList
);

// GET /get-user-course-purchased/:courseId
router.get(
  "/get-user-course-purchased/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCoursePurchases
);

// GET /get-user-course-range/:courseId
router.get(
  "/get-user-course-range/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getUsersCountByProgressRange
);

// GET /get-user-course-range/:courseId
router.get(
  "/get-course-stats/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCourseStats
);

// GET /get-user-course-status/:courseId
router.get(
  "/get-course-status/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCompletionStatus
);

router.get(
  "/course-progress-detailed/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCourseAnalytics
);


module.exports = router;
