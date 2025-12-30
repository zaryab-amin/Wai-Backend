/* eslint-disable quotes */
const express = require("express");
const {
  createQuiz,
  getQuiz,
  updateQuiz,
  deleteQuiz,
  publishQuiz,
  getQuizByUser,
  createQuizByTemplate,
  getPublishedQuiz,
  getPublishedQuizByUser,
  getPremiumQuiz,
  shareQuiz,
  addQuestionsToCourseQuiz,
  addExistingQuizToLecture,
  updateCourseQuizQuestions,
  deleteQuizQuestions,
  getCreatedQuizzes,
  addQuestionsToQuiz,
  updateQuizQuestions,
  cloneQuestion,
  getQuizForAdmin,
  updateQuizSettings,
  unpublishQuiz,
  getMarketPlaceQuizzes,
  updateQuizPrivacy,
} = require("../../controllers/quiz.controller");
const {
  authorize,
  SUPER_ADMIN,
  ADMIN,
  ORGANIZATION_ADMIN,
} = require("../../middlewares/auth");
const multer = require("multer");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 150 }, // 150 MB file size limit
});

// create
router.post(
  "/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single("file"),
  createQuiz
);

// create
router.post(
  "/share_quiz",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  shareQuiz
);

// get quiz by user
router.get(
  "/quiz_by_user/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getQuizByUser
);

// create quiz by template
router.post(
  "/create_quiz_by_template",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  createQuizByTemplate
);

// get published quiz
router.get(
  "/published_quiz/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getPublishedQuiz
);

router.get(
  "/getCreatedQuizzes",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCreatedQuizzes
);

// get published quiz
router.get("/premium_quiz/", authorize(), getPremiumQuiz);

router.get("/getMarketPlaceQuizzes", authorize(), getMarketPlaceQuizzes);

// get published quiz
router.get("/published_quiz_by_user/", authorize(), getPublishedQuizByUser);

// get quiz
router.get("/:quizId", authorize(), getQuiz);

// get quiz
router.get(
  "/getQuizForAdmin/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getQuizForAdmin
);

// publish
router.put(
  "/publish",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  publishQuiz
);

router.put(
  "/unpublish",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  unpublishQuiz
);

// update quiz
router.put(
  "/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single("file"),
  updateQuiz
);

router.put(
  "/updateSettings/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateQuizSettings
);

// delete quiz
router.delete(
  "/delete/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteQuiz
);

router.post(
  "/question/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  addQuestionsToQuiz
);

router.put(
  "/question/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateQuizQuestions
);

router.post(
  "/question/clone/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  cloneQuestion
);

router.put(
  "/updateQuizPrivacy/:quizId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateQuizPrivacy
);

router.post(
  "/addQuestion/:courseId/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  addQuestionsToCourseQuiz
);

router.post(
  "/addQuiz/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  addExistingQuizToLecture
);

router.put(
  "/updateQuestion/:courseId/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateCourseQuizQuestions
);

router.delete(
  "/:quizId/:questionId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteQuizQuestions
);

module.exports = router;
