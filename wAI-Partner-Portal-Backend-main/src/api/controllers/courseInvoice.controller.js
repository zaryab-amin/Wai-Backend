const { getConfig } = require("../../config/vars");
const CourseInvoice = require("../models/courseInvoice.model");

exports.getCourseInvoicesByOrganization = async (req, res) => {
  try {
    const { courseId } = req.params;
    const organization = req?.user?.organization;

    const queryObject = {
      course: courseId,
      organization,
    };

    const invoices = await CourseInvoice.find(queryObject)
      .populate([
        { path: "course", select: "courseName" },
        { path: "user", select: "name email" },
        { path: "organization", select: "name" },
      ])
      .sort("-createdAt");

    const totalInvoices = await CourseInvoice.countDocuments(queryObject);

    return res.status(200).json({
      success: true,
      data: invoices,
      totalInvoices: totalInvoices,
    });
  } catch (error) {
    console.log("error------->", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching invoices",
    });
  }
};

exports.getInvoicesByOrganization = async (req, res) => {
  try {
    const { page = 1, limit = 10, purchaseType } = req.query;
    const organization = req?.user?.organization;
    const config = getConfig();
    const queryObject = {
      ...(organization.toString() !== config?.prescientOrgId && {
        organization,
      }),
    };

    if (purchaseType && ["Course", "Quiz"].includes(purchaseType)) {
      queryObject.purchaseType = purchaseType;
    }

    const [invoices, totalCount] = await Promise.all([
      CourseInvoice.find(queryObject)
        .populate([
          { path: "course", select: "courseName" },
          { path: "quiz" },
          { path: "user", select: "name email" },
          { path: "organization", select: "name" },
        ])
        .sort("-createdAt")
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),

      CourseInvoice.countDocuments(queryObject),
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
    console.error("Get course invoices error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching invoices",
    });
  }
};

exports.getCommission = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const invoices = await CourseInvoice.find({
      platformFee: { $gt: 0 },
    })
      .populate({
        path: "organization",
        select: "name",
      })
      .populate({ path: "user", select: "name email" },)
      .populate({
        path: "course",
        select: "courseName",
      })
      .populate({
        path: "quiz",
        select: "name",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await CourseInvoice.countDocuments({
      platformFee: { $gt: 0 },
    });

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
    console.error("Error fetching course invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
