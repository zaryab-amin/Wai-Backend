/* eslint-disable import/order */
/* eslint-disable quotes */
const Quiz = require("../models/quiz.model");
const User = require("../models/user.model");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const { v4: uuidv4 } = require("uuid");
const emailProvider = require("../services/emails/emailProvider");
const { ReqLogger } = require("../utils/Logger");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const { isSuperAdminUser } = require("../utils");
const Organization = require("../models/organization.model");
const CourseInvoice = require("../models/courseInvoice.model");
const { createPurchaseNotification } = require("../services/notification");
const { getConfig } = require("../../config/vars");

const config = getConfig();
const stripe = require("stripe")(config.stripeSecretKey);

exports.createQuizPurchase = async (req, res, next) => {
  try {
    const { quizId } = req.body;
    const organization = req?.user?.organization;
    const userType = req.user?.userType;
    const config = getConfig();

    const purchaseId = uuidv4({ format: "hex" });
    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      $or: [
        { organization: new ObjectId(organization) },
        { quizPrivacy: "public" },
      ],
    });
    const _id = new mongoose.Types.ObjectId();

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const body = {
      user: req.user._id,
      organization: quiz?.organization,
      quiz: quiz._id,
      hasPurchased: true,
    };

    const existingPurchase = await PurchaseQuiz.findOne(body);

    if (existingPurchase) {
      return res.status(404).json({
        message: "Quiz already purchased",
        success: false,
      });
    }

    // If user is organization type, create free purchase directly
    if (userType === "organization") {
      const purchase = new PurchaseQuiz({
        _id,
        purchaseQuizId: purchaseId,
        user: new ObjectId(req.user._id),
        organization: quiz?.organization,
        quiz: quiz._id,
        quizName: quiz.name,
        hasPurchased: true,
        amount: 0, // Free for organization users
        sessionId: null,
        paymentId: "org_free",
        isConnectedAccount: false,
      });
      await purchase.save();

      return res.status(201).json({
        status: "success",
        message: "Quiz successfully purchased.",
        result: purchase,
      });
    }

    // Continue with normal payment flow for non-organization users
    if (quiz.quizType === "premium") {
      const org = await Organization.findById(quiz?.organization);

      let session = null;
      let isConnectedAccount = false;

      if (org._id.toString() === config.prescientOrgId) {
        session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: quiz.name,
                },
                unit_amount: quiz.quizPrice * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${config.clientURL}/quizzes?status=success&type=purchased&purchaseId=${_id}&quizId=${quizId}`,
          cancel_url: `${config.clientURL}/quizzes?status=cancelled&type=premium&purchaseId=${_id}&quizId=${quizId}`,
          payment_intent_data: {
            metadata: {
              quiz_name: quiz.name,
              organization: "prescient",
            },
          },
        });
        isConnectedAccount = false;
      } else {
        if (!org.stripeAccountId) {
          return res.status(400).json({
            error: "Organization's Stripe account not configured",
          });
        }

        const baseAmount = quiz.quizPrice * 100;
        const applicationFeeAmount = Math.round(baseAmount * 0.03);
        const organizationAmount = baseAmount - applicationFeeAmount;

        console.log("Payment Breakdown:");
        console.log("------------------");
        console.log(`Total Amount: $${baseAmount / 100}`);
        console.log(`Platform Fee (3%): $${applicationFeeAmount / 100}`);
        console.log(`Organization Receives: $${organizationAmount / 100}`);
        console.log(`Organization Stripe Account: ${org.stripeAccountId}`);

        session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: quiz.name,
                },
                unit_amount: baseAmount,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${config.clientURL}/quizzes?status=success&type=purchased&purchaseId=${_id}&quizId=${quizId}`,
          cancel_url: `${config.clientURL}/quizzes?status=cancelled&type=premium&purchaseId=${_id}&quizId=${quizId}`,
          payment_intent_data: {
            application_fee_amount: applicationFeeAmount,
            transfer_data: {
              destination: org.stripeAccountId,
            },
            metadata: {
              quiz_name: quiz.name,
              organization_id: org._id.toString(),
              is_connected_account: "true",
            },
          },
        });
        isConnectedAccount = true;
      }

      const purchase = new PurchaseQuiz({
        _id,
        purchaseQuizId: purchaseId,
        user: new ObjectId(req.user._id),
        organization: quiz?.organization,
        quiz: quiz._id,
        quizName: quiz.name,
        hasPurchased: false,
        amount: quiz.quizPrice,
        sessionId: session.id,
        paymentId: session.payment_intent,
        isConnectedAccount,
      });
      await purchase.save();

      return res.json({ sessionId: session.id });
    }

    // Handle non-premium quizzes
    const purchase = new PurchaseQuiz({
      _id,
      purchaseQuizId: purchaseId,
      user: new ObjectId(req.user._id),
      organization: quiz?.organization,
      quiz: quiz._id,
      quizName: quiz.name,
      hasPurchased: true,
      amount: 0,
      sessionId: null,
      paymentId: quiz.quizType,
      isConnectedAccount: false,
    });
    await purchase.save();

    return res.status(201).json({
      status: "success",
      message: "Quiz successfully purchased.",
      result: purchase,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.getPurchasedQuizzes = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const quizzes = await PurchaseQuiz.find({
      user: req.user._id,
      // ...(!isSuperAdmin
      //   ? {
      //     $or: [
      //       { organization: new ObjectId(organization) },
      //       { quizPrivacy: "public" },
      //     ],
      //   }
      //   : {}),
      paymentId: { $ne: null },
      hasPurchased: true,
    })
      .populate({
        path: "quiz",
        match: { isPublished: { $eq: true } },
        populate: {
          path: "questions",
          select: "question_number question options questionType",
        },
      })
      .exec();

    if (!quizzes || !quizzes?.length) {
      return res.status(200).json({
        status: "success",
        message: "Paid quizzes have been successfully retrieved.",
        data: [],
      });
    }

    ReqLogger(req, "info", "Paid quizzes have been successfully retrieved.");
    return res.status(200).json({
      status: "success",
      message: "Paid quizzes have been successfully retrieved.",
      data: quizzes,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyQuizPayment = async (req, res, next) => {
  try {
    const { purchaseId } = req.body;
    const config = getConfig();
    const existingInvoices = await CourseInvoice.find({
      purchase: new ObjectId(purchaseId),
    });

    if (existingInvoices.length > 0) {
      console.log(
        "Found existing invoices for purchase:",
        purchaseId,
        existingInvoices
      );
      return res.status(400).json({
        success: true,
        message: "Payment already processed",
        existingInvoices,
      });
    }
    const purchase = await PurchaseQuiz.findOne({
      _id: new ObjectId(purchaseId),
    }).populate([
      {
        path: "quiz",
      },
      {
        path: "organization",
        populate: {
          path: "signatoryUser",
        },
      },
    ]);

    if (!purchase) {
      ReqLogger(req, "error", "No purchase record found.");
      return res.status(404).json({ error: "No purchase record found." });
    }
    const session = await stripe.checkout.sessions.retrieve(purchase.sessionId);

    const existingInvoiceByPaymentIntent = await CourseInvoice.findOne({
      paymentIntentId: session.payment_intent,
    });

    if (existingInvoiceByPaymentIntent) {
      console.log(
        "Found existing invoice for payment intent:",
        session.payment_intent
      );
      return res.status(400).json({
        success: true,
        message: "Payment already processed",
        invoice: existingInvoiceByPaymentIntent,
      });
    }

    const user = await User.findOne({ _id: purchase?.user });

    let stripeCustomer;
    if (session.payment_status === "paid") {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent
      );

      if (!session.customer) {
        stripeCustomer = await stripe.customers.create({
          email: session.customer_details.email,
          name: session.customer_details.name,
          metadata: {
            purchaseId: purchaseId,
          },
        });

        console.log("Created new customer:", stripeCustomer.id);
      } else {
        stripeCustomer = await stripe.customers.retrieve(session.customer);
      }
      if (purchase.isConnectedAccount) {
        const [orgInvoice, platformInvoice] = await Promise.all([
          // Organization invoice
          stripe.invoices
            .create({
              customer: stripeCustomer.id,
              auto_advance: true,
              collection_method: "charge_automatically",
              metadata: {
                purchaseId,
                type: "organization",
                organizationId: purchase.organization._id.toString(),
              },
              description: `Quiz Purchase: ${purchase.quizName}`,
            })
            .then(async (invoice) => {
              await stripe.invoiceItems.create({
                customer: stripeCustomer.id,
                invoice: invoice.id,
                amount:
                  paymentIntent.amount - paymentIntent.application_fee_amount,
                currency: "usd",
                description: `Quiz Purchase: ${purchase.quizName}`,
              });

              const finalizedInvoice = await stripe.invoices.finalizeInvoice(
                invoice.id
              );
              const paidInvoice = await stripe.invoices.pay(invoice.id, {
                paid_out_of_band: true,
              });

              return paidInvoice;
            }),

          // Platform (Precient) invoice
          stripe.invoices
            .create({
              customer: stripeCustomer.id,
              auto_advance: true,
              collection_method: "charge_automatically",
              metadata: {
                purchaseId,
                type: "platform",
                organizationId: config.prescientOrgId,
              },
              description: "Platform Fee",
            })
            .then(async (invoice) => {
              await stripe.invoiceItems.create({
                customer: stripeCustomer.id,
                invoice: invoice.id,
                amount: paymentIntent.application_fee_amount,
                currency: "usd",
                description: `Platform Fee for Quiz: ${purchase.quizName}`,
              });

              const finalizedInvoice = await stripe.invoices.finalizeInvoice(
                invoice.id
              );
              const paidInvoice = await stripe.invoices.pay(invoice.id, {
                paid_out_of_band: true,
              });

              return paidInvoice;
            }),
        ]);

        console.log("quiz purchased----------->", purchase);
        // Store both invoices
        const quizInvoice = new CourseInvoice({
          purchase: purchase._id,
          quiz: purchase.quiz._id,
          user: purchase.user,
          organization: purchase.organization._id,
          amount: paymentIntent.amount / 100,
          platformFee: paymentIntent.application_fee_amount / 100,
          organizationAmount:
            (paymentIntent.amount - paymentIntent.application_fee_amount) / 100,
          stripeCustomerId: stripeCustomer.id,
          paymentIntentId: paymentIntent.id,
          // Organization invoice details
          organizationInvoiceId: orgInvoice.id,
          organizationInvoiceUrl: orgInvoice.hosted_invoice_url,
          // Platform invoice details
          platformInvoiceId: platformInvoice.id,
          platformInvoiceUrl: platformInvoice.hosted_invoice_url,
          status: "paid",
          purchaseType: "Quiz",
          metadata: {
            customerEmail: session.customer_details.email,
            customerName: session.customer_details.name,
            platformOrganizationId: config.prescientOrgId,
          },
        });

        await quizInvoice.save();

        await createPurchaseNotification({
          purchaseId: quizInvoice?._id,
          organization: purchase.organization._id,
          title: "New quiz purchased",
          message: `New quiz purchased ${purchase.quizName}`,
        });

        emailProvider.sendQuizPurchaseNotifications(
          quizInvoice,
          purchase?.quizName,
          user,
          purchase?.organization?.name,
          purchase?.organization?.signatoryUser?.email
        );
        console.log(
          "quiz invoice created for both platform and organization:",
          quizInvoice
        );
      } else {
        console.log("here------------->", session);
        // Precient organization invoice
        const invoice = await stripe.invoices.create({
          customer: stripeCustomer.id,
          auto_advance: true,
          collection_method: "charge_automatically",
          metadata: {
            purchaseId,
            type: "prescient",
          },
          description: `Quiz Purchase: ${purchase.quizName}`,
        });

        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          invoice: invoice.id,
          amount: paymentIntent.amount,
          currency: "usd",
          description: `Quiz Purchase: ${purchase.quizName}`,
        });

        const finalizedInvoice = await stripe.invoices.finalizeInvoice(
          invoice.id
        );

        const paidInvoice = await stripe.invoices.pay(invoice.id, {
          paid_out_of_band: true,
        });
        console.log("quiz purchased----------->", purchase);
        const quizInvoice = new CourseInvoice({
          purchase: purchase._id,
          quiz: purchase.quiz._id,
          user: purchase.user,
          organization: config.prescientOrgId,
          amount: paymentIntent.amount / 100,
          platformFee: 0,
          organizationAmount: paymentIntent.amount / 100,
          stripeCustomerId: stripeCustomer.id,
          paymentIntentId: paymentIntent.id,
          stripeInvoiceId: invoice.id,
          platformInvoiceId: paidInvoice.id,
          platformInvoiceUrl: paidInvoice.hosted_invoice_url,
          status: "paid",
          purchaseType: "Quiz",
          metadata: {
            customerEmail: session.customer_details.email,
            customerName: session.customer_details.name,
            type: "prescient",
          },
        });

        await quizInvoice.save();

        await createPurchaseNotification({
          purchaseId: quizInvoice?._id,
          organization: purchase.organization._id,
          title: "New quiz purchased",
          message: `New quiz purchased ${purchase.quizName}`,
        });

        emailProvider.sendOrganizationQuizPurchaseNotification(
          quizInvoice,
          purchase?.quizName,
          user
        );
        console.log("Quiz invoice created:", quizInvoice);
      }
      purchase.stripeCustomerId = stripeCustomer.id;
      purchase.paymentId = session.payment_intent;
      purchase.hasPurchased = true;
      await purchase.save();
      ReqLogger(req, "info", "Payment successful");
      return res.send("Payment successful");
    } else {
      // await PurchaseQuiz.deleteOne({
      //   _id: new ObjectId(purchaseId),
      // });
      ReqLogger(req, "info", "Payment unsuccessful");
      return res.status(400).send("Payment unsuccessful");
    }
  } catch (error) {
    next(error);
  }
};
