/* eslint-disable quotes */
const express = require("express");

const { authorize, SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");
const {
  getTemplateByUser,
  getTemplate,
  deleteTemplate,
} = require("../../controllers/templateCourses.controller");
const {
  createCourseByTemplate,
} = require("../../controllers/course.controller");

const router = express.Router();

// create
// router.post("/", authorize(), createTemplate);
// get template by user
router.get(
  "/template_by_user/",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getTemplateByUser
);

// get template by id
router.get("/:templateId", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), getTemplate);

// create course by template
router.post(
  "/create_course_by_template",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  createCourseByTemplate
);

// update template
// router.put("/", authorize(), updateTemplate);

// delete template
router.delete(
  "/delete/:templateId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteTemplate
);

module.exports = router;
