/* eslint-disable quotes */
const express = require("express");
const userRoutes = require("./user.route");
const authRoutes = require("./auth.route");
const quizRoutes = require("./quiz.route");
const templateRoutes = require("./template.route");
const examRoutes = require("./exam.route");
const reportRoutes = require("./report.route");
const screenshotRoutes = require("./screenshot.route");
const courseRoutes = require("./course.route");
const courseModuleRoutes = require("./courseModule.route");
const courseLecureRoutes = require("./courseLecture.route");
const demoRoutes = require("./demo.route");
const purchaseRoutes = require("./purchase.route");
const certifcateRoutes = require("./certificate.route");
const courseTemplateRoutes = require("./courseTemplate.route");
const analyticsRoutes = require("./analytics.route");
const organizationsRoutes = require("./organization.route");
const purchaseQuizRoutes = require("./purchaseQuiz.route");
const S3Routes = require("./s3.route");
const requestCourse = require("./requestCourse.route");
const invites = require("./invite.route");
const subscriptionsRoute = require("./subscription.route");
const folderRoutes = require("./folder.route");
const statsRoutes = require("./stats.route");
const adminAnalyticsRoutes = require("./adminAnalytics.route");
const stripeRoutes = require("./stripe.route");
const invoiceRoutes = require("./invoice.route");
const courseInvoiceRoutes = require("./courseInvoices.route");
const notifications = require("./notification.route");
const supportRoutes = require("./support")

const router = express.Router();

/**
 * GET v1/status
 */
router.get("/status", (req, res) => res.send("OK"));

/**
 * GET v1/docs
 */
router.use("/docs", express.static("docs"));

router.use("/users", userRoutes);
router.use("/auth", authRoutes);
router.use("/quiz", quizRoutes);
router.use("/template", templateRoutes);
router.use("/exam", examRoutes);
router.use("/support", supportRoutes);
router.use("/report", reportRoutes);
router.use("/screenshot", screenshotRoutes);
router.use("/course", courseRoutes);
router.use("/courseModule", courseModuleRoutes);
router.use("/courseLecture", courseLecureRoutes);
router.use("/demo", demoRoutes);
router.use("/purchase", purchaseRoutes);
router.use("/certificate", certifcateRoutes);
router.use("/course-template", courseTemplateRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/organization", organizationsRoutes);
router.use("/purchase-quiz", purchaseQuizRoutes);
router.use("/invites", invites);
router.use("/s3", S3Routes);
router.use("/request-courses", requestCourse);
router.use("/subscription", subscriptionsRoute);
router.use("/folder", folderRoutes);
router.use("/stats", statsRoutes);
router.use("/adminAnalytics", adminAnalyticsRoutes);
router.use("/stripe", stripeRoutes);
router.use("/invoice", invoiceRoutes);
router.use("/course-invoice", courseInvoiceRoutes);
router.use("/notifications", notifications);

module.exports = router;
