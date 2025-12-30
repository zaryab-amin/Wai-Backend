const express = require("express");
const {
  connectStripeWithKey,
  updateStripeKeys,
} = require("../../controllers/stripe.controller");

const router = express.Router();

router.post("/connect-stripe", connectStripeWithKey);

router.put("/update-stripe", updateStripeKeys);

module.exports = router;
