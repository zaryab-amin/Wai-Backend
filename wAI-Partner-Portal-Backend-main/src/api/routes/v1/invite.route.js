/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");
const {
  getInvitedUsersForQuiz,
  getInvitedQuizForUser,
  getCourseInvitesForUser,
} = require("../../controllers/invite.controller");

const router = express.Router();

router.get("/", authorize(), getInvitedQuizForUser);

router.get("/course", authorize(), getCourseInvitesForUser);

// GET /invited users by quiz
router.get("/:quizId", authorize(), getInvitedUsersForQuiz);

module.exports = router;
