const express = require("express");
const multer = require("multer");
const {
  authorize,
  SUPER_ADMIN,
  ORGANIZATION_ADMIN,
  // LOGGED_USER,
  ADMIN,
} = require("../../middlewares/auth");
const {
  createCourse,
  getCourse,
  getCourseByUser,
  deleteCourse,
  getAllCourse,
  updateCourse,
  subscribeCourse,
  getSubscribedCourse,
  markAsDone,
  requestForCourse,
  changePrivacyStatus,
  updateCourseProgress,
  generateAILecture,
  coursePublishStatus,
  shareCourse,
  getRecommendedCourses,
  getCourseStat,
  getCourseForAdmin,
  updateCourseStatus,
  getCreatedCourses,
  updateCoursePrivacy,
  getMarketPlaceCourses,
} = require("../../controllers/course.controller");

// const { changePrivacyStatusSchema } = require("../../validations/course.validation");
// const { getUserCoursesStats } = require("../../controllers/stats.controller");

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
  "/create",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single('file'),
  createCourse
);

router.get(
  "/getCourseForAdmin/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCourseForAdmin,
)

router.post("/share_course", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), shareCourse);

router.get("/stats", authorize(), getCourseStat);

// request for course
router.post("/request-for-course", authorize(), requestForCourse);
// get course by user
router.get("/course_by_user/", authorize(), getCourseByUser);

// get subscribed courses
router.get("/subscribed-courses", authorize(), getSubscribedCourse);

router.get("/recommended-courses", authorize(), getRecommendedCourses);

// marked as done lecture
router.post("/mark-as-done", authorize(), markAsDone);

// course progress
router.put("/course-progress", authorize(), updateCourseProgress);

// get all course
router.get("/", authorize(), getAllCourse);

router.get(
  "/getMarketPlaceCourses",
  authorize(),
  getMarketPlaceCourses
);

router.get(
  "/getCreatedCourses",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  getCreatedCourses,
)

// get courses
router.get("/:courseId", authorize(), getCourse);

// subscribe course
router.post("/subscribe", authorize(), subscribeCourse);

// change privacy
router.put(
  "/change-privacy",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  // validate(changePrivacyStatusSchema, {}, {}),
  changePrivacyStatus
);

// publish/unpublish course
router.put(
  "/change-publish-status",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  coursePublishStatus
);

// generate lecture by AI
router.post(
  "/generate-lecture-by-ai",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  generateAILecture
);

// update quiz
router.put("/", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), updateCourse);

router.put("/updateCourseForAdmin/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single('file'),
  updateCourse
);

router.put("/updateCourseStatus/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateCourseStatus
);

router.put("/updateCoursePrivacy/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateCoursePrivacy
);

// delete course
router.delete(
  "/delete/:courseId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteCourse
);

module.exports = router;
