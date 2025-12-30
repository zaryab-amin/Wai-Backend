/* eslint-disable quotes */
const express = require("express");
const multer = require("multer");
const {
  Upload,
  uploadAvatar,
  uploadLogo,
} = require("../../controllers/gcs.controller"); // Changed from s3.controller to gcs.controller
const {
  ADMIN,
  SUPER_ADMIN,
  ORGANIZATION_ADMIN,
  authorize,
} = require("../../middlewares/auth");

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

router.post(
  "/upload",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.single("courseImage"),
  Upload
);

router.post("/uploadAvatar", authorize(), upload.single("file"), uploadAvatar);

router.post("/uploadLogo", authorize(), upload.single("file"), uploadLogo);

module.exports = router;
