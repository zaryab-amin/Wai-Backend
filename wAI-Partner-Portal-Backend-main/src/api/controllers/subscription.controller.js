const { v4: uuidv4 } = require("uuid");
const Organization = require("../models/organization.model");
const { ReqLogger, InfoLogger } = require("../utils/Logger");
const Invoice = require("../models/invoice.model");
const emailProvider = require("../services/emails/emailProvider");
const { getConfig } = require("../../config/vars");

const config = getConfig();
const stripe = require("stripe")(config.stripeSecretKey);

exports.createSubscription = async (req, res, next) => {
  try {
    const config = getConfig();
    const { organizationId, numberOfUsers } = req.body;

    if (!organizationId || !numberOfUsers) {
      return res.status(400).json({
        message: "Organization ID and number of users are required",
        success: false,
      });
    }

    // Find organization with populated signatory user
    const existingOrganization = await Organization.findOne({
      _id: organizationId,
    })
      .populate("signatoryUser")
      .exec();

    if (!existingOrganization) {
      return res.status(400).json({
        message: "Organization not found",
        success: false,
      });
    }

    if (!existingOrganization.signatoryUser?.email) {
      return res.status(400).json({
        message: "Signatory user email not found",
        success: false,
      });
    }

    // Find or create Stripe customer
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: existingOrganization.signatoryUser.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customer = await stripe.customers.update(existingCustomers.data[0].id, {
          metadata: {
            organizationId: organizationId.toString(),
            numberOfUsers: String(numberOfUsers),
          },
        });
      } else {
        customer = await stripe.customers.create({
          email: existingOrganization.signatoryUser.email,
          metadata: {
            organizationId: organizationId.toString(),
            numberOfUsers: String(numberOfUsers),
          },
        });
      }
    } catch (stripeError) {
      console.error("Stripe customer error:", stripeError);
      return res.status(500).json({
        message: "Failed to create/update Stripe customer",
        success: false,
      });
    }

    // Create Stripe checkout session
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price: config.stripePidPerUser,
            quantity: numberOfUsers,
            adjustable_quantity: {
              enabled: true,
              minimum: 1,
              maximum: 999,
            },
          },
        ],
        metadata: {
          organizationId: organizationId.toString(),
          numberOfUsers: String(numberOfUsers),
        },
        subscription_data: {
          metadata: {
            organizationId: organizationId.toString(),
            numberOfUsers: String(numberOfUsers),
          },
        },
        success_url: `${config.clientURL}/settings`,
        cancel_url: `${config.clientURL}/settings`,
      });
    } catch (stripeError) {
      console.error("Stripe session error:", stripeError);
      return res.status(500).json({
        message: "Failed to create checkout session",
        success: false,
      });
    }

    // Update organization with session details
    try {
      await Organization.findByIdAndUpdate(organizationId, {
        sessionId: session.id,
        subscriptionStatus: session.payment_status,
        numberOfUsers: numberOfUsers,
        updatedAt: new Date(),
      });
    } catch (dbError) {
      console.error("Database update error:", dbError);
    }

    return res.json({
      sessionId: session.id,
      organizationId,
      success: true,
    });
  } catch (error) {
    console.error("Subscription creation error:", error);
    return res.status(500).json({
      message: "An unexpected error occurred",
      success: false,
    });
  }
};

exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  const payload = req.body;
  const config = getConfig();

  console.log("🔵 WEBHOOK START ------------------------------");
  InfoLogger({}, "info", `Webhook started ---------> ${JSON.stringify(sig)}`);

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      config?.stripeWebhookSecret
    );
    console.log("✅ Webhook Signature Verified");
    console.log("🎯 Event Type:", event.type);
    console.log("📄 Full Event:", JSON.stringify(event, null, 2));
    InfoLogger(
      {},
      "info",
      `Webhook Signature Verified ---------> ${JSON.stringify(event)}`
    );
  } catch (err) {
    console.log("❌ Webhook Signature Verification Failed", err.message);
    InfoLogger(
      {},
      "error",
      `Webhook Signature Verification Failed: ---------> ${JSON.stringify(err)}`
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        console.log("💳 CHECKOUT SESSION COMPLETED ----------------");
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
        console.log("📥 SUBSCRIPTION CREATED ---------------------");
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        console.log("📝 SUBSCRIPTION UPDATED ---------------------");
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "invoice.created":
        console.log("📃 INVOICE CREATED -------------------------");
        await handleInvoiceCreated(event.data.object);
        break;

      case "invoice.finalized":
        console.log("✍️ INVOICE FINALIZED -----------------------");
        await handleInvoiceFinalized(event.data.object);
        break;

      case "invoice.payment_succeeded":
        console.log("💰 INVOICE PAID ----------------------------");
        await handleInvoicePaid(event.data.object);
        break;

      case "invoice.payment_failed":
        console.log("⚠️ PAYMENT FAILED --------------------------");
        await handleInvoicePaymentFailed(event.data.object);
        break;
    }

    console.log("✅ Webhook Handled Successfully");
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook Handler Failed:", err.message);
    console.error("Stack:", err.stack);
    InfoLogger(
      {},
      "error",
      `Webhook handler failed ---------> ${JSON.stringify(err)}`
    );
    return res.status(500).send(`Webhook handler failed: ${err.message}`);
  }
};

async function handleSubscriptionUpdated(subscription) {
  try {
    console.log("🔄 Processing Updated Subscription:", {
      id: subscription.id,
      quantity: subscription.quantity,
      status: subscription.status,
    });

    // Get the organization
    const organization = await Organization.findOne({
      "pendingSubscriptionUpdate.subscriptionId": subscription.id,
    });

    if (organization) {
      console.log("📦 Found organization with pending update:", {
        orgId: organization._id,
        currentUsers: organization.numberOfUsers,
        pendingUsers: organization.pendingSubscriptionUpdate.newUserCount,
      });

      // Get the latest invoice
      if (subscription.latest_invoice) {
        const invoice = await stripe.invoices.retrieve(
          subscription.latest_invoice
        );
        console.log("Latest invoice details:", {
          id: invoice.id,
          amount_due: invoice.amount_due,
          status: invoice.status,
        });

        if (invoice.amount_due > 0) {
          // Create payment intent for the invoice amount
          const paymentIntent = await stripe.paymentIntents.create({
            amount: invoice.amount_due,
            currency: "usd",
            customer: subscription.customer,
            // invoice: invoice.id,
          });

          // Update organization with invoice info
          await Organization.findByIdAndUpdate(organization._id, {
            "pendingSubscriptionUpdate.invoiceId": invoice.id,
            "pendingSubscriptionUpdate.paymentIntentId": paymentIntent.id,
            updatedAt: new Date(),
          });

          // Create invoice record
          await Invoice.create({
            organizationId: organization._id,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_due / 100, // Convert to dollars
            status: invoice.status || "open",
            billingPeriodStart: new Date(
              subscription.current_period_start * 1000
            ),
            billingPeriodEnd: new Date(subscription.current_period_end * 1000),
            numberOfUsers: subscription.quantity,
            pricePerUser: 5,
            type: "subscription_update",
          });

          await emailProvider.sendSubscriptionUpdateNotification(
            {
              previousUserCount:
                organization.pendingSubscriptionUpdate.previousUserCount,
              newUserCount: organization.pendingSubscriptionUpdate.newUserCount,
              nextBillingDate: subscription.current_period_end * 1000,
              changes: {
                type:
                  organization.pendingSubscriptionUpdate.newUserCount <
                  organization.pendingSubscriptionUpdate.previousUserCount
                    ? "decrease"
                    : "increase",
                difference: Math.abs(
                  organization.pendingSubscriptionUpdate.newUserCount -
                    organization.pendingSubscriptionUpdate.previousUserCount
                ),
                prorationAmount: invoice.amount_due / 100,
              },
              invoiceUrl: invoice.hosted_invoice_url,
            },
            organization
          );
        } else {
          // If no payment needed, update organization immediately
          const invoice = await stripe.invoices.retrieve(
            subscription.latest_invoice
          );

          await Organization.findByIdAndUpdate(organization._id, {
            numberOfUsers: organization.pendingSubscriptionUpdate.newUserCount,
            billingCycleEndDate: new Date(
              subscription.current_period_end * 1000
            ),
            $unset: { pendingSubscriptionUpdate: "" },
            updatedAt: new Date(),
          });

          // For no payment case
          await emailProvider.sendSubscriptionUpdateNotification(
            {
              previousUserCount:
                organization.pendingSubscriptionUpdate.previousUserCount,
              newUserCount: organization.pendingSubscriptionUpdate.newUserCount,
              nextBillingDate: subscription.current_period_end * 1000,
              changes: {
                type:
                  organization.pendingSubscriptionUpdate.newUserCount <
                  organization.pendingSubscriptionUpdate.previousUserCount
                    ? "decrease"
                    : "increase",
                difference: Math.abs(
                  organization.pendingSubscriptionUpdate.newUserCount -
                    organization.pendingSubscriptionUpdate.previousUserCount
                ),
                prorationAmount: 0, // No charge for this update
              },
              invoiceUrl: invoice.hosted_invoice_url,
            },
            organization
          );
        }
      }
    } else {
      // Regular subscription update
      await Organization.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          numberOfUsers: subscription.quantity,
          billingCycleStartDate: new Date(
            subscription.current_period_start * 1000
          ),
          billingCycleEndDate: new Date(subscription.current_period_end * 1000),
          updatedAt: new Date(),
        }
      );

      console.log("organization-------------->", organization);

      // await emailProvider.sendSubscriptionEmails(
      //   {
      //     newUserCount: subscription.quantity,
      //     billingCycleStartDate: subscription.current_period_start * 1000,
      //     billingCycleEndDate: subscription.current_period_end * 1000,
      //     nextBillingDate: subscription.current_period_end * 1000,
      //     isRegularUpdate: true,
      //   },
      //   {
      //     name: organization?.name,
      //     signatoryUser: organization?.signatoryUser,
      //   },
      //   "regular"
      // );
    }

    console.log("✅ Subscription update processed successfully");
  } catch (error) {
    console.error("❌ Error handling subscription update:", error);
    throw error;
  }
}

async function handleCheckoutCompleted(session) {
  try {
    console.log("🔄 Processing Checkout Session:");
    console.log(JSON.stringify(session, null, 2));

    const organizationId = session.metadata.organizationId;
    const updateResult = await Organization.findByIdAndUpdate(organizationId, {
      isActive: true,
      sessionId: session.id,
      isRestricted: false,
      planType: "premium",
      subscriptionStatus: "active",
    });

    console.log(
      "✅ Organization Updated:",
      JSON.stringify(updateResult, null, 2)
    );
  } catch (error) {
    console.error("❌ Checkout Completion Failed:", error);
    throw error;
  }
}

async function handleSubscriptionCreated(subscription) {
  try {
    console.log("🔄 Processing New Subscription:");
    console.log(JSON.stringify(subscription, null, 2));

    const organizationId = subscription.metadata.organizationId;
    const updateResult = await Organization.findByIdAndUpdate(organizationId, {
      subscriptionId: subscription.id,
      numberOfUsers: parseInt(subscription.metadata.numberOfUsers),
      billingCycleStartDate: new Date(subscription.current_period_start * 1000),
      billingCycleEndDate: new Date(subscription.current_period_end * 1000),
    });

    console.log(
      "✅ Organization Updated:",
      JSON.stringify(updateResult, null, 2)
    );
  } catch (error) {
    console.error("❌ Subscription Creation Failed:", error);
    throw error;
  }
}

async function handleInvoiceCreated(invoice) {
  try {
    console.log("🔄 Processing New Invoice:");
    console.log(JSON.stringify(invoice, null, 2));

    if (invoice.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription
      );
      console.log(
        "📦 Retrieved Subscription:",
        JSON.stringify(subscription, null, 2)
      );

      const organizationId = subscription.metadata.organizationId;
      const newInvoice = await Invoice.create({
        organizationId,
        stripeInvoiceId: invoice.id,
        amount: invoice.amount_due / 100,
        status: "unpaid",
        billingPeriodStart: new Date(invoice.period_start * 1000),
        billingPeriodEnd: new Date(invoice.period_end * 1000),
        numberOfUsers: parseInt(subscription.metadata.numberOfUsers),
        pricePerUser: 5,
        invoice_pdf: invoice.hosted_invoice_url,
      });

      console.log("✅ Invoice Created:", JSON.stringify(newInvoice, null, 2));
    }
  } catch (error) {
    console.error("❌ Invoice Creation Failed:", error);
    throw error;
  }
}

async function handleInvoiceFinalized(invoice) {
  try {
    console.log("🔄 Processing Finalized Invoice:");
    console.log(JSON.stringify(invoice, null, 2));

    const updateResult = await Invoice.findOneAndUpdate(
      { stripeInvoiceId: invoice.id },
      { invoice_pdf: invoice.hosted_invoice_url }
    );

    console.log("✅ Invoice Updated:", JSON.stringify(updateResult, null, 2));
  } catch (error) {
    console.error("❌ Invoice Finalization Failed:", error);
    throw error;
  }
}

async function handleInvoicePaid(invoice) {
  try {
    console.log("🔄 Processing Paid Invoice:");
    console.log(JSON.stringify(invoice, null, 2));

    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription
    );
    console.log(
      "📦 Retrieved Subscription:",
      JSON.stringify(subscription, null, 2)
    );

    const organizationId = subscription.metadata.organizationId;

    const organization = await Organization.findById(organizationId)
      .populate("signatoryUser")
      .exec();

    const orgUpdateResult = await Organization.findByIdAndUpdate(
      organizationId,
      {
        subscriptionStatus: "active",
        isActive: true,
        billingCycleStartDate: new Date(invoice.period_start * 1000),
        billingCycleEndDate: new Date(invoice.period_end * 1000),
      }
    );

    console.log(
      "✅ Organization Updated:",
      JSON.stringify(orgUpdateResult, null, 2)
    );

    const invoiceUpdateResult = await Invoice.findOneAndUpdate(
      { stripeInvoiceId: invoice.id },
      {
        status: "paid",
        paidAt: new Date(),
        invoice_pdf: invoice.hosted_invoice_url,
      }
    );

    await emailProvider.sendSubscriptionPurchaseNotifications(
      {
        plan: "Business Plan Subscription",
        numberOfUsers: parseInt(subscription.metadata.numberOfUsers),
        amount: invoice.amount_due / 100,
        organizationAmount: invoice.amount_due / 100, // 97% to organization
        billingCycleStartDate: new Date(invoice.period_start * 1000),
        billingCycleEndDate: new Date(invoice.period_end * 1000),
        invoiceUrl: invoice.hosted_invoice_url,
      },
      organization.signatoryUser,
      organization
    );

    console.log(
      "✅ Invoice Updated:",
      JSON.stringify(invoiceUpdateResult, null, 2)
    );
  } catch (error) {
    console.error("❌ Invoice Payment Processing Failed:", error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice) {
  try {
    console.log("🔄 Processing Failed Invoice Payment:");
    console.log(JSON.stringify(invoice, null, 2));

    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription
    );
    console.log(
      "📦 Retrieved Subscription:",
      JSON.stringify(subscription, null, 2)
    );

    const organizationId = subscription.metadata.organizationId;

    const orgUpdateResult = await Organization.findByIdAndUpdate(
      organizationId,
      {
        subscriptionStatus: "past_due",
      }
    );

    console.log(
      "✅ Organization Updated:",
      JSON.stringify(orgUpdateResult, null, 2)
    );

    const invoiceUpdateResult = await Invoice.findOneAndUpdate(
      { stripeInvoiceId: invoice.id },
      {
        status: "failed",
        invoice_pdf: invoice.hosted_invoice_url,
      }
    );

    console.log(
      "✅ Invoice Updated:",
      JSON.stringify(invoiceUpdateResult, null, 2)
    );
  } catch (error) {
    console.error("❌ Failed Payment Processing Failed:", error);
    throw error;
  }
}

exports.updateSubscriptionUsers = async (req, res) => {
  try {
    const { organizationId, newUserCount, currentUserCount } = req.body;
    const config = getConfig();

    const organization = await Organization.findById(organizationId)
      .populate("signatoryUser")
      .exec();

    if (!organization?.subscriptionId) {
      return res.status(404).json({
        message: "No active subscription found",
        success: false,
      });
    }

    const currentSubscription = await stripe.subscriptions.retrieve(
      organization.subscriptionId
    );

    const now = Math.floor(Date.now() / 1000);
    const cycleEnd = currentSubscription.current_period_end;
    const daysRemaining = Math.ceil((cycleEnd - now) / (24 * 3600));
    const totalDays = Math.ceil(
      (cycleEnd - currentSubscription.current_period_start) / (24 * 3600)
    );

    const PRICE_PER_USER = 5;
    const userDifference = Math.abs(newUserCount - currentUserCount);
    const fullMonthDifference = userDifference * PRICE_PER_USER;
    const proratedAmount = (fullMonthDifference * daysRemaining) / totalDays;

    const preview = await stripe.invoices.retrieveUpcoming({
      customer: currentSubscription.customer,
      subscription: organization.subscriptionId,
      subscription_items: [
        {
          id: currentSubscription.items.data[0].id,
          quantity: newUserCount,
        },
      ],
    });

    const updatedSubscription = await stripe.subscriptions.update(
      organization.subscriptionId,
      {
        items: [
          {
            id: currentSubscription.items.data[0].id,
            quantity: newUserCount,
          },
        ],
        proration_behavior: "always_invoice",
        metadata: {
          ...currentSubscription.metadata,
          numberOfUsers: String(newUserCount),
          lastUpdateType:
            newUserCount < currentUserCount ? "decrease" : "increase",
          lastUpdateDate: new Date().toISOString(),
        },
      }
    );

    const invoice = await stripe.invoices.retrieve(
      updatedSubscription.latest_invoice
    );

    console.log("invocie----------------->", invoice);
    if (invoice.amount_due === 0) {
      await Organization.findByIdAndUpdate(organizationId, {
        numberOfUsers: newUserCount,
        updatedAt: new Date(),
      });

      return res.json({
        success: true,
        message: "Subscription updated successfully with no payment required",
        subscription: {
          id: updatedSubscription.id,
          previousUserCount: currentUserCount,
          newUserCount: newUserCount,
          effectiveDate: new Date(),
          nextBillingDate: new Date(
            updatedSubscription.current_period_end * 1000
          ),
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: currentSubscription.customer,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Subscription Update: ${currentUserCount} → ${newUserCount} users`,
              description: `Prorated charge for user count update\nCurrent bill: $${
                currentUserCount * 5
              }/month\nNew bill starting next month: $${
                newUserCount * 5
              }/month`,
            },
            unit_amount: Math.max(invoice.amount_due, 50),
            tax_behavior: "exclusive",
          },
          quantity: 1,
        },
      ],
      metadata: {
        subscriptionId: updatedSubscription.id,
        organizationId: organizationId,
        updateType: newUserCount < currentUserCount ? "decrease" : "increase",
      },
      success_url: `${config.clientURL}/settings`,
      cancel_url: `${config.clientURL}/settings`,
    });

    await Organization.findByIdAndUpdate(organizationId, {
      pendingSubscriptionUpdate: {
        newUserCount: newUserCount,
        previousUserCount: currentUserCount,
        subscriptionId: updatedSubscription.id,
        checkoutSessionId: session.id,
        invoiceId: invoice.id,
        updateDate: new Date(),
        prorationDetails: {
          daysRemaining,
          currentMonthlyRate: currentUserCount * PRICE_PER_USER,
          newMonthlyRate: newUserCount * PRICE_PER_USER,
          proratedAmount: invoice.amount_due / 100,
        },
      },
      updatedAt: new Date(),
    });

    return res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      subscription: {
        id: updatedSubscription.id,
        previousUserCount: currentUserCount,
        newUserCount: newUserCount,
        effectiveDate: new Date(),
        nextBillingDate: new Date(cycleEnd * 1000),
        prorationAmount: invoice.amount_due / 100,
        changes: {
          type: newUserCount < currentUserCount ? "decrease" : "increase",
          difference: userDifference,
          daysRemaining,
          currentMonthlyRate: currentUserCount * PRICE_PER_USER,
          newMonthlyRate: newUserCount * PRICE_PER_USER,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error updating subscription:", error);
    return res.status(500).json({
      message: "Failed to update subscription",
      success: false,
      error: error.message,
    });
  }
};

exports.verifySubscription = async (req, res, next) => {
  try {
    const { organizationId } = req.body;
    const organization = await Organization.findOne({ organizationId }).exec();
    if (!organization) {
      ReqLogger(req, "error", "No purchase record found.");
      return res.status(404).json({ error: "Organization not found" });
    }
    const session = await stripe.checkout.sessions.retrieve(
      organization.sessionId
    );
    console.log(session);
    if (session.payment_status === "paid") {
      organization.subscriptionId = session.subscription;
      organization.subscriptionStatus = "active";
      await organization.save();
      // emailProvider.sendCoursePurchased(purchase.course.courseName);
      ReqLogger(req, "info", "Payment was successful.");
      return res.send("Payment successful");
    }
    await organization.deleteOne({ organizationId });
    // emailProvider.sendPaymentCancel(purchase.course.courseName);
    ReqLogger(req, "info", "Payment was not successful.");
    return res.status(400).send("Payment has been camcelled.");
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.verifyUpdateSubscription = async (req, res, next) => {
  try {
    const { organizationId } = req.body;
    const organization = await Organization.findOne({ organizationId }).exec();
    if (!organization) {
      ReqLogger(req, "error", "No purchase record found.");
      return res.status(404).json({ error: "Organization not found" });
    }

    const subscription = await stripe.subscriptions.retrieve(
      organization.subscriptionId
    );
    // const session = await stripe.checkout.sessions.retrieve(
    //   organization.sessionId
    // );
    console.log(subscription.status);
    console.log(subscription);
    res.send("ok");
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.updateSubscription = async (req, res, next) => {
  try {
    const { newQuantity, organizationId } = req.body;
    console.log(req.body);

    const existingOrganization = await Organization.findOne({
      _id: organizationId,
    });
    console.log(existingOrganization);
    const { subscriptionId } = existingOrganization;

    console.log(existingOrganization.sessionId);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            quantity: existingOrganization.numberOfUsers + newQuantity,
          },
        ],
      }
    );

    console.log(updatedSubscription);

    const { quantity } = updatedSubscription;

    if (updatedSubscription.status !== "active") {
      throw new Error("Failed to update subscription");
    }

    existingOrganization.numberOfUsers = quantity;

    await existingOrganization.save();

    ReqLogger(req, "info", "Payment updated successfully.");
    return res.json({ message: "Payment updated successfully." });
  } catch (error) {
    console.log(error);
    next(error);
  }
};
