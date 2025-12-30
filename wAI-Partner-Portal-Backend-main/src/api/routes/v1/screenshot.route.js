/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");
const {
  postScreenshots,
  getScreenshots,
} = require("../../controllers/screenshot.controller");

const router = express.Router();

// POST screenshot
router.post("/", authorize(), postScreenshots);

// get quiz
router.get("/:quizId", authorize(), getScreenshots);

module.exports = router;
