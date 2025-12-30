const express = require("express");
const {
  createSubscription,
  verifySubscription,
  updateSubscription,
  verifyUpdateSubscription,
  updateSubscriptionUsers,
} = require("../../controllers/subscription.controller");

const router = express.Router();

router.post("/create", createSubscription);

router.put("/update-users", updateSubscriptionUsers);

// PUT /verify-subscription
router.put("/verify-subscription", verifySubscription);

// PUT /verify-update-subscription
router.put("/verify-update-subscription", verifyUpdateSubscription);

// PUT /update-subscription
router.put("/update-subscription", updateSubscription);

module.exports = router;
