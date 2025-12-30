/* eslint-disable quotes */
const express = require("express");
const { validate } = require("express-validation");
const {
  authorize,
  // SUPER_ADMIN,
  // LOGGED_USER,
  // ADMIN,
} = require("../../middlewares/auth");
const {
  getUserStats,
  getUserCoursesStats,
  getUserQuizzesStats
} = require("../../controllers/stats.controller");

const router = express.Router();

// get subscribed courses
router.get("/user-stats", authorize(), getUserStats);

router.get("/user-course-stats", authorize(), getUserCoursesStats);

router.get("/user-quiz-stats", authorize(), getUserQuizzesStats);

module.exports = router;
