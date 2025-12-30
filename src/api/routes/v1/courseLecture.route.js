const express = require("express");
const multer = require("multer");
const {
  authorize,
  SUPER_ADMIN,
  ORGANIZATION_ADMIN,
  ADMIN,
} = require("../../middlewares/auth");
const {
  addCourseLecture,
  updateCourseLecture,
  updateCourseLectureStatus,
  deleteCourseLecture,
  deleteCourseLectureVideo,
  deleteLectureDocument,
  updateOrder
} = require("../../controllers/courseLecture.controller");

const storage = multer.memoryStorage(); // Use memoryStorage for buffer-based uploads

const fileFilter = (req, file, cb) => {
  const allowedVideoTypes = ["video/mp4", "video/avi", "video/mpeg", "video/quicktime", "video/x-matroska"];
  const allowedDocumentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (
    (file.fieldname === "file" && allowedVideoTypes.includes(file.mimetype)) ||
    (file.fieldname === "document" && allowedDocumentTypes.includes(file.mimetype))
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only videos (MP4, AVI, MPEG) or documents (PDF, DOC, DOCX) allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 * 1024 }, // 3 GB
});

const router = express.Router();

// create
router.post(
  "/addCourseLecture",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  addCourseLecture
);

router.put(
  "/updateCourseLecture/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "document", maxCount: 1 },
  ]),
  updateCourseLecture
);

router.put(
  "/updateOrder",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  updateOrder
);

router.put(
  "/updateLectureStatus/:courseId/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single('file'),
  updateCourseLectureStatus
);

router.delete(
  "/:courseId/:lectureId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteCourseLecture,
)

router.delete(
  "/:courseId/:lectureId/:videoId",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteCourseLectureVideo,
)

router.delete(
  "/:courseId/:lectureId/:documentId/document",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  deleteLectureDocument
);

module.exports = router;
