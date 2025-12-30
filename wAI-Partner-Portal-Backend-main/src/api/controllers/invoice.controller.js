const Invoice = require("../models/invoice.model");
const CourseInvoice = require("../models/courseInvoice.model");
const { getConfig } = require("../../config/vars");

exports.getSubscriptionInvoiceByOrganization = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const organization = req.user.organization;
    const config = getConfig();

    const queryObject = {
      ...(organization.toString() !== config.prescientOrgId && {
        organizationId: organization,
      }),
    };

    const [invoices, totalCount] = await Promise.all([
      Invoice.find(queryObject)
        .populate([
          {
            path: "organizationId",
            select: "name organizationId signatoryUser",
            populate: {
              path: "signatoryUser",
              select: "name email",
            },
          },
        ])
        .sort("-createdAt")
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),

      Invoice.countDocuments(queryObject),
    ]);

    return res.status(200).json({
      success: true,
      data: invoices,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Invoice fetch error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllInvoiceByOrganization = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const organization = req.user.organization;
    const skip = (page - 1) * limit;
    const config = getConfig();

    const userSearchQuery = search
      ? {
        $or: [
          { "user.name": { $regex: search, $options: "i" } },
          { "user.email": { $regex: search, $options: "i" } },
        ],
      }
      : {};

    const [subscriptionInvoices, subscriptionCount] = await Promise.all([
      Invoice.find({
        ...(organization.toString() !== config?.prescientOrgId && {
          organizationId: organization,
        }),
      })
        .populate([
          {
            path: "organizationId",
            select: "name organizationId signatoryUser organizationLogo",
            populate: {
              path: "signatoryUser",
              select: "name email",
            },
          },
          {
            path: "user",
            select: "name email",
            match: search
              ? {
                $or: [
                  { name: { $regex: search, $options: "i" } },
                  { email: { $regex: search, $options: "i" } },
                ],
              }
              : {},
          },
        ])
        .lean(),
      Invoice.countDocuments({
        ...(organization.toString() !== config?.prescientOrgId && {
          organizationId: organization,
        }),
        ...userSearchQuery,
      }),
    ]);

    const [courseInvoices, courseCount] = await Promise.all([
      CourseInvoice.find({
        ...(organization.toString() !== config?.prescientOrgId && {
          organization: organization,
        }),
      })
        .populate([
          {
            path: "organization",
            select: "name organizationId signatoryUser organizationLogo",
            populate: {
              path: "signatoryUser",
              select: "name email",
            },
          },
          {
            path: "course",
            select: "courseName description",
          },
          {
            path: "user",
            select: "name email",
            match: search
              ? {
                $or: [
                  { name: { $regex: search, $options: "i" } },
                  { email: { $regex: search, $options: "i" } },
                ],
              }
              : {},
          },
          {
            path: "quiz",
            select: "name description",
          },
        ])
        .lean(),
      CourseInvoice.countDocuments({
        ...(organization.toString() !== config?.prescientOrgId && {
          organization: organization,
        }),
        ...userSearchQuery,
      }),
    ]);

    // Filter out invoices where user is null after search match
    // const filteredSubscriptionInvoices = subscriptionInvoices.filter(
    //   (invoice) => invoice.user
    // );
    const filteredCourseInvoices = courseInvoices.filter(
      (invoice) => invoice.user
    );

    const transformedSubscriptionInvoices = subscriptionInvoices.map(
      (invoice) => ({
        ...invoice,
        type: "subscription",
        invoiceDate: invoice.billingPeriodStart,
      })
    );

    const transformedCourseInvoices = filteredCourseInvoices.map((invoice) => ({
      ...invoice,
      type: "course",
    }));

    const allInvoices = [
      ...transformedSubscriptionInvoices,
      ...transformedCourseInvoices,
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const paginatedInvoices = allInvoices.slice(skip, skip + Number(limit));
    const totalCount =
      subscriptionInvoices.length + filteredCourseInvoices.length;
    const totalPages = Math.ceil(totalCount / Number(limit));

    return res.status(200).json({
      success: true,
      data: paginatedInvoices,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        totalPages,
        total: totalCount,
        subscriptionInvoices: subscriptionInvoices.length,
        courseInvoices: filteredCourseInvoices.length,
      },
    });
  } catch (error) {
    console.error("Invoice fetch error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
      stack: config?.env === "development" ? error.stack : undefined,
    });
  }
};

// Helper function to format currency (optional)
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};
