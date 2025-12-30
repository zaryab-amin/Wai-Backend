const express = require('express');
const router = express.Router();
const { sendSupportForm } = require('../../services/emails/emailProvider');

router.post('/send-email', async (req, res) => {
  const { firstName, lastName, email, subject, message } = req.body;
  console.log(req.body, "<=== req body")
  try {
    await sendSupportForm({ firstName, lastName, email, subject, message });
    res.status(200).json({ success: true, message: "Support request sent!" });
  } catch (error) {
    console.error("Support Form API Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
