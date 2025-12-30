/* eslint-disable quotes */
const express = require("express");
const { authorize } = require("../../middlewares/auth");

const {
  createQuizPurchase,
  verifyQuizPayment,
  getPurchasedQuizzes,
} = require("../../controllers/purchaseQuiz.controller");

const router = express.Router();

// POST / purchase course
router.post("/", authorize(), createQuizPurchase);

// GET /exam-start
router.get("/", authorize(), getPurchasedQuizzes);

// PUT /verify-payment
router.put("/verify-payment", verifyQuizPayment);

module.exports = router;
