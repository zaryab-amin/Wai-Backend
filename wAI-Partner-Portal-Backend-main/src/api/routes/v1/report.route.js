/* eslint-disable quotes */
const express = require("express");
const {
  getResult,
  getResultByQuizId,
  getUserReportStats,
  getUserQuizReports,
  getUserQuizReportAttempts,
} = require("../../controllers/report.controller");
const {
  authorize,
  SUPER_ADMIN,
  ADMIN,
  ORGANIZATION_ADMIN
} = require("../../middlewares/auth");

const router = express.Router();

router.get("/user-report-stats", authorize(), getUserReportStats);
router.get("/user-report-attempts", authorize(), getUserQuizReportAttempts);
router.get("/", authorize(), getUserQuizReports);
// GET all reports by quizId
router.get("/quiz/:quizId", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), getResultByQuizId);

// GET result
router.get("/:resultId", authorize(), getResult);

module.exports = router;
