/* eslint-disable quotes */
const express = require("express");
const { authorize, SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN } = require("../../middlewares/auth");
const {
  createFolder,
  getFolders,
  renameFolder,
  deleteFolder,
} = require("../../controllers/folder.controller");

const router = express.Router();

// POST / create-folder
router.post("/", authorize(SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN), createFolder);

// GET /get-all-folder
router.get("/", authorize(SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN), getFolders);

// PUt /rename-folder
router.put("/", authorize(SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN), renameFolder);

// PUt /delete-folder
router.put("/delete", authorize(SUPER_ADMIN, ADMIN, ORGANIZATION_ADMIN), deleteFolder);

module.exports = router;
