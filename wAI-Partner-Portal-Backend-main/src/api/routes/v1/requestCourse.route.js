/* eslint-disable quotes */
const express = require("express");
const { authorize, SUPER_ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");
const {
  createRequestCourse,
  getRequestCourseById,
  updateRequestCourseById,
  listRequestCourses,
} = require("../../controllers/requestCourse.controller");

const router = express.Router();

// Create a new RequestCourse
router.post("/", authorize(), createRequestCourse);

// List all RequestCourses
router.get("/", authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]), listRequestCourses);
// Get a RequestCourse by ID
router.get("/:requestCourseId", authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]), getRequestCourseById);

// Update a RequestCourse by ID
router.put(
  "/:requestCourseId",
  authorize([SUPER_ADMIN, ORGANIZATION_ADMIN]),
  updateRequestCourseById
);

module.exports = router;
