/* eslint-disable quotes */
const express = require("express");
const {
  createTemplate,
  getTemplateByUser,
  getTemplate,
  deleteTemplate,
  updateTemplate,
} = require("../../controllers/template.controller");
const { authorize } = require("../../middlewares/auth");

const router = express.Router();

// create
router.post("/", authorize(), createTemplate);
// get template by user
router.get("/template_by_user/", authorize(), getTemplateByUser);

// get template by id
router.get("/:templateId", authorize(), getTemplate);

// update template
router.put("/", authorize(), updateTemplate);

// delete template
router.delete("/delete/:templateId", authorize(), deleteTemplate);

module.exports = router;
