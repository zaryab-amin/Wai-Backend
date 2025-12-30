const express = require("express");
const {
  authorize,
  SUPER_ADMIN,
  // LOGGED_USER,
  ADMIN,
  ORGANIZATION_ADMIN
} = require("../../middlewares/auth");
const {
  addCourseModule,
  updateCourseModule,
  deleteCourseModule,
  updateCourseModuleStatus,
  cloneCourseModule,
  updateOrder
} = require("../../controllers/courseModule.controller");

const router = express.Router();

// create
router.post(
  "/addCourseModule",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  addCourseModule
);

router.put(
  "/updateOrder",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateOrder
);
router.post(
  "/clone/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  cloneCourseModule
);

router.put(
  "/updateCourseModule/:moduleId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateCourseModule
);

router.put(
  "/updateModuleStatus/:courseId/:moduleId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateCourseModuleStatus
);

router.delete(
  "/:courseId/:moduleId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteCourseModule,
)

module.exports = router;
