/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");
const {
  getCourseInvoicesByOrganization,
  getInvoicesByOrganization,
  getCommission,
} = require("../../controllers/courseInvoice.controller");

const router = express.Router();

router.get("/", authorize(), getInvoicesByOrganization);

router.get("/commission", authorize(), getCommission);

router.get("/:courseId", authorize(), getCourseInvoicesByOrganization);

module.exports = router;
