/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");
const {
  createPurchase,
  getPurchasedCourse,
  verifyPayment,
  purchaseFreemiumCourse,
  getInProgressCourse,
  updateLastOpenedAt,
  addCourseModuleAndLectures,
  updateLectureProgress,
  getPurchasedCourseById,
} = require("../../controllers/purchase.controller");

const router = express.Router();

// POST / purchase course
router.post("/", authorize(), createPurchase);

// GET /exam-start
router.get("/", authorize(), getPurchasedCourse);
router.get("/in-progress", authorize(), getInProgressCourse);

router.get("/:courseId", authorize(), getPurchasedCourseById);

router.put("/:courseId/updateLastOpenedAt", authorize(), updateLastOpenedAt);

// PUT /purchase-freemium-course
router.put("/purchase-freemium-course", purchaseFreemiumCourse);

// PUT /verify-payment
router.put("/verify-payment", verifyPayment);

router.post(
  "/addCourseModuleAndLectures/:purchaseId",
  authorize(),
  addCourseModuleAndLectures,
)

router.post(
  "/updateLectureProgress/:purchaseId",
  authorize(),
  updateLectureProgress,
)

module.exports = router;
