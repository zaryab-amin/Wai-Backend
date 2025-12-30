// routes/demo.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  authorize,
  SUPER_ADMIN,
  ORGANIZATION_ADMIN,
  ADMIN,
} = require("../../middlewares/auth");
const { addDemo, getDemos, deleteDemoDocument } = require("../v1/../../controllers//demo.controller");
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedVideo = ["video/mp4", "video/avi", "video/mpeg", "video/quicktime", "video/x-matroska"];
  const allowedDoc = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

  if (
    (file.fieldname === "file" && allowedVideo.includes(file.mimetype)) ||
    (file.fieldname === "document" && allowedDoc.includes(file.mimetype))
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 * 1024 }, // 3GB
});

router.post(
  "/add",
  authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]),
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "document", maxCount: 1 },
  ]),
  addDemo
);

// router.get("/", getDemos);
router.get("/", authorize(), getDemos);

router.delete("/:demoId/document/:documentKey", authorize([SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN]), deleteDemoDocument);

module.exports = router;