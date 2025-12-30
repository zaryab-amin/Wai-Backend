/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");

const {
  createCertficate,
  getCertificate,
  // getCertificateByUser,
  getCertificateDataByUser,
} = require("../../controllers/certificate.controller");
// const {
//   createPurchase,
//   getPurchasedCourse,
// } = require("../../controllers/purchase.controller");

const router = express.Router();

// GET /get certificate
router.post("/", authorize(), createCertficate);
// get certificates by user
router.get("/", authorize(), getCertificateDataByUser);

// get certificates
router.get("/:certificateId", authorize(), getCertificate);

module.exports = router;
