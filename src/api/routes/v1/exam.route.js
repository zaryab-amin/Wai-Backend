/* eslint-disable quotes */
const express = require("express");
const { startExam, submitExam, submitCourseLectureQuiz } = require("../../controllers/exam.controller");
const { authorize } = require("../../middlewares/auth");

const router = express.Router();

// GET /exam-start
router.get("/:quizId", authorize(), startExam);

// POST / exam-submit
router.post("/", authorize(), submitExam);

router.post(
  "/submitCourseQuiz/:purchaseId/:quizId",
  authorize(),
  submitCourseLectureQuiz
)

module.exports = router;
