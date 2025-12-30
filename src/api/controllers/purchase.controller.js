/* eslint-disable import/order */
/* eslint-disable quotes */
const Course = require("../models/course.model");
const Coupon = require("../models/coupon.model");
const CouponUsage = require("../models/couponUsage.mode");
const Purchase = require("../models/purchase.model");
const { v4: uuidv4 } = require("uuid");
const emailProvider = require("../services/emails/emailProvider");
const { ReqLogger, InfoLogger } = require("../utils/Logger");
const { getSignedUrlFile } = require("./gcs.controller");
const { queryBuilder } = require("../utils/queryBuilder");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const CourseLecture = require("../models/courseLecture.model");
const CourseModule = require("../models/courseModule.model");
const { isSuperAdminUser } = require("../utils");
const Organization = require("../models/organization.model");
const User = require("../models/user.model");
const CourseInvoice = require("../models/courseInvoice.model");
const { createPurchaseNotification } = require("../services/notification");
const { getConfig } = require("../../config/vars");

const config = getConfig();
// const stripe = require("stripe")(config.stripeSecretKey);

// exports.createPurchase = async (req, res, next) => {
//   try {
//     const { courseId, couponCode } = req.body;
//     const user = req.user._id;
//     const userType = req.user?.userType;
//     const config = getConfig();
//     const organization = req?.user?.organization;
//     const purchaseId = uuidv4({ format: "hex" });
//     const _id = new mongoose.Types.ObjectId();

//     const course = await Course.findOne({
//       _id: new ObjectId(courseId),
//       $or: [{ organization }, { coursePrivacy: "public" }],
//     });

//     if (!course) {
//       ReqLogger(req, "error", "Course not found");
//       return res.status(404).json({ error: "Course not found" });
//     }

//     const body = {
//       user,
//       organization: course?.organization,
//       course: course._id,
//       hasPurchased: true,
//     };

//     const existingPurchase = await Purchase.findOne(body);

//     if (existingPurchase) {
//       ReqLogger(req, "error", "This course has already been purchased.");
//       return res.status(400).json({
//         message: "This course has already been purchased.",
//         success: false,
//       });
//     }

//     // Determine price based on user type and coupon
//     let price = 0;
//     const coupon = null;

//     if (userType === "organization") {
//       // Organization users get the course for free
//       price = 0;
//     } else if (couponCode === "ashar100") {
//       price = 0; // Full discount
//     } else {
//       price = course.coursePrice;
//     }

//     if (course.courseType === "premium" && userType !== "organization") {
//       const org = await Organization.findById(course?.organization);

//       let session = null;
//       let isConnectedAccount = false;

//       InfoLogger(
//         {},
//         "info",
//         `${JSON.stringify(org)} ====>>> ${config?.prescientOrgId}`
//       );

//       if (org._id.toString() === config.prescientOrgId) {
//         session = await stripe.checkout.sessions.create({
//           payment_method_types: ["card"],
//           line_items: [
//             {
//               price_data: {
//                 currency: "usd",
//                 product_data: {
//                   name: course.courseName,
//                 },
//                 unit_amount: price * 100,
//               },
//               quantity: 1,
//             },
//           ],
//           mode: "payment",
//           success_url: `${config.clientURL}/courses?status=success&purchaseId=${_id}`,
//           cancel_url: `${config.clientURL}/courses?status=cancelled&purchaseId=${_id}`,
//           payment_intent_data: {
//             metadata: {
//               course_name: course.courseName,
//               organization: "prescient",
//             },
//           },
//         });
//         isConnectedAccount = false;
//       } else {
//         if (!org.stripeAccountId) {
//           return res.status(400).json({
//             error: "Organization's Stripe account not configured",
//           });
//         }

//         const baseAmount = price * 100;
//         const applicationFeeAmount = Math.round(baseAmount * 0.03);
//         const organizationAmount = baseAmount - applicationFeeAmount;

//         console.log("Payment Breakdown:");
//         console.log("------------------");
//         console.log(`Total Amount: $${baseAmount / 100}`);
//         console.log(`Platform Fee (3%): $${applicationFeeAmount / 100}`);
//         console.log(`Organization Receives: $${organizationAmount / 100}`);
//         console.log(`Organization Stripe Account: ${org.stripeAccountId}`);

//         session = await stripe.checkout.sessions.create({
//           payment_method_types: ["card"],
//           line_items: [
//             {
//               price_data: {
//                 currency: "usd",
//                 product_data: {
//                   name: course.courseName,
//                 },
//                 unit_amount: price * 100,
//               },
//               quantity: 1,
//             },
//           ],
//           mode: "payment",
//           success_url: `${config.clientURL}/courses?status=success&purchaseId=${_id}`,
//           cancel_url: `${config.clientURL}/courses?status=cancelled&purchaseId=${_id}`,
//           payment_intent_data: {
//             application_fee_amount: applicationFeeAmount,
//             transfer_data: {
//               destination: org.stripeAccountId,
//             },
//             metadata: {
//               course_name: course.courseName,
//               organization_id: org._id.toString(),
//               is_connected_account: "true",
//             },
//           },
//         });
//         isConnectedAccount = true;
//       }

//       console.log("\nStripe Session Details:");
//       console.log("----------------------");
//       console.log(`Session ID: ${session.id}`);
//       console.log(`Payment Intent: ${session.payment_intent}`);

//       const purchase = new Purchase({
//         _id,
//         purchaseId,
//         user: req.user._id,
//         organization: course?.organization,
//         courseId: course._id,
//         coupon,
//         hasPurchased: false,
//         course: course._id,
//         amount: price,
//         sessionId: session.id,
//         paymentId: session.payment_intent,
//         isConnectedAccount,
//       });
//       await purchase.save();

//       return res.json({ sessionId: session.id });
//     }

//     // Handle free courses or organization users
//     const purchase = new Purchase({
//       purchaseId,
//       user: req.user._id,
//       organization: course?.organization,
//       courseId: course._id,
//       hasPurchased: true,
//       coupon,
//       course: course._id,
//       amount: price,
//       sessionId: null,
//       paymentId: course.courseType,
//     });
//     await purchase.save();
//     emailProvider.sendCoursePurchased(purchase.course.courseName, req?.user);

//     ReqLogger(req, "info", "Course successfully purchased.");
//     return res.status(201).json({
//       status: "success",
//       message: "Course successfully purchased.",
//       result: purchase,
//     });
//   } catch (error) {
//     console.log(error);
//     next(error);
//   }
// };

const stripe = require("stripe")(config.stripeSecretKey);

exports.createPurchase = async (req, res, next) => {
  try {
    const { courseId, coupon } = req.body;
    const user = req.user._id;
    const userType = req.user?.userType;
    const config = getConfig();
    const organization = req?.user?.organization;
    const purchaseId = uuidv4({ format: "hex" });
    const _id = new mongoose.Types.ObjectId();

    const course = await Course.findOne({
      _id: new mongoose.Types.ObjectId(courseId),
      $or: [{ organization }, { coursePrivacy: "public" }],
    });

    if (!course) {
      ReqLogger(req, "error", "Course not found");
      return res.status(404).json({ error: "Course not found" });
    }

    // Check for existing purchase (uncomment if needed)
    /*
    const existingPurchase = await Purchase.findOne({
      user,
      organization: course?.organization,
      course: course._id,
      hasPurchased: true,
    });
    if (existingPurchase) {
      console.log(`[Purchase] Existing purchase found: purchaseId=${existingPurchase.purchaseId}`);
    ReqLogger(req, "error", "This course has already been purchased.");
    return res.status(400).json({
        message: "This course has already been purchased.",
        success: false,
      });
    }
    */

    // Determine price based on coupon
    let price = course.coursePrice || 0;
    let couponValue = coupon ? coupon.trim() : null;

    if (couponValue && couponValue === "ashar100") {
      console.log(
        "[Purchase] Valid coupon 'ashar100' applied, setting price to 0"
      );
      price = 0;
    } else if (couponValue) {
      console.log(
        `[Purchase] Invalid coupon '${couponValue}' provided, keeping original price: ${price}`
      );
    } else {
      console.log(
        `[Purchase] No coupon provided, keeping original price: ${price}`
      );
    }

    console.log(
      `[Purchase] Final price after coupon logic: ${price}, coupon: ${couponValue}`
    );

    if (course.courseType === "premium" && price > 0) {
      console.log(
        "[Purchase] Processing premium course with payment, creating Stripe session"
      );

      const org = await Organization.findById(course?.organization);

      let session = null;

      InfoLogger(
        {},
        "info",
        `${JSON.stringify(org)} ====>>> ${config?.prescientOrgId}`
      );

      // Use different Stripe configuration based on the organization
      let stripeInstance;

      if (org._id.toString() === config.prescientOrgId) {
        // Use platform's Stripe account
        stripeInstance = stripe;

        session = await stripeInstance.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: course.courseName,
                },
                unit_amount: price * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${config.clientURL}/courses?status=success&purchaseId=${_id}`,
          cancel_url: `${config.clientURL}/courses?status=cancelled&purchaseId=${_id}`,
          payment_intent_data: {
            metadata: {
              course_name: course.courseName,
              organization: "prescient",
            },
          },
        });
      } else {
        // Use organization's Stripe keys
        if (!org.stripeSecretKey) {
          return res.status(400).json({
            error: "Organization's Stripe account not configured",
          });
        }

        console.log("\nStripe Session Details:");
        console.log("----------------------");

        // Initialize Stripe with organization's secret key
        stripeInstance = require("stripe")(org.stripeSecretKey);

        session = await stripeInstance.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: course.courseName,
                },
                unit_amount: price * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${config.clientURL}/courses?status=success&purchaseId=${_id}`,
          cancel_url: `${config.clientURL}/courses?status=cancelled&purchaseId=${_id}`,
          payment_intent_data: {
            metadata: {
              course_name: course.courseName,
              organization_id: org._id.toString(),
            },
          },
        });
      }

      console.log("\nStripe Session Details:");
      console.log("----------------------");
      console.log(`Session ID: ${session.id}`);
      console.log(`Payment Intent: ${session.payment_intent}`);

      const purchase = new Purchase({
        _id,
        purchaseId,
        user: req.user._id,
        organization: course?.organization,
        courseId: course._id,
        coupon: couponValue,
        hasPurchased: false,
        course: course._id,
        amount: price,
        sessionId: session.id,
        paymentId: session.payment_intent,
        // Keep track of which organization's Stripe account was used
        stripeOrganizationId: org._id,
      });
      await purchase.save();

      return res.json({
        sessionId: session.id,
        // If it's not the platform's Stripe, include the publishable key
        ...(org._id.toString() !== config.prescientOrgId && {
          publishableKey: org.stripePublishableKey,
        }),
      });
    }

    // Handle free courses or organization users
    const purchase = new Purchase({
      _id,
      purchaseId,
      user: req.user._id,
      organization: course?.organization,
      courseId: course._id,
      coupon: couponValue,
      hasPurchased: true,
      course: course._id,
      amount: price,
      sessionId: null,
      paymentId: course.courseType,
    });
    await purchase.save();
    emailProvider.sendCoursePurchased(purchase.course.courseName, req?.user);

    ReqLogger(req, "info", "Course successfully purchased.");
    return res.status(201).json({
      status: "success",
      message: "Course successfully purchased.",
      result: purchase,
      sessionId: null,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.purchaseFreemiumCourse = async (req, res, next) => {
  try {
    const { purchaseId } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const config = getConfig();

    const purchase = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!purchase) {
      ReqLogger(req, "error", "No purchase record found.");
      return res.status(404).json({ error: "No purchase record found." });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: purchase.course.courseName,
            },
            unit_amount: purchase.course.coursePrice * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${config.clientURL}/courses?status=success&purchaseId=${_id}`,
      cancel_url: `${config.clientURL}/courses?status=cancelled&purchaseId=${_id}`,
    });

    purchase.sessionId = session.id;
    purchase.paymentId = session.payment_intent;
    await purchase.save();

    ReqLogger(req, "info", "Checkout");
    return res.json({ sessionId: session.id });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

exports.getPurchasedCourse = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      courseType,
      category,
      difficultyLevel,
      minAmount = 0,
      maxAmount = 0,
      pricing,
    } = req.query;
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const filterQuery = {
      $and: [],
    };

    if (search) {
      filterQuery.$and.push({
        $or: [
          { courseName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { courseCategory: { $regex: search, $options: "i" } },
          { categoryTags: { $elemMatch: { $regex: search, $options: "i" } } },
        ],
      });
    }

    if (courseType) {
      filterQuery.$and.push({ courseType });
    }
    if (difficultyLevel?.length) {
      filterQuery.$and.push({
        difficultyLevel: { $in: difficultyLevel.split(",") },
      });
    }
    if (category?.length) {
      filterQuery.$and.push({
        courseCategory: { $in: category.split(",") },
      });
    }

    if (pricing && pricing !== "allCourses") {
      if (pricing === "freeCourse") {
        filterQuery.$and.push({ coursePrice: 0 });
      } else if (pricing === "premiumCourse") {
        filterQuery.$and.push({ coursePrice: { $gt: 0 } });
      } else if (pricing === "purchasedCourse") {
        // Redundant since we're already filtering purchased courses, but kept for consistency
        filterQuery.$and.push({ user: new mongoose.Types.ObjectId(userId) });
      }
    } else {
      // Apply min/max if pricing is not freeCourse or premiumCourse
      if (Number(minAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
      }
      if (Number(maxAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
      }
    }

    // Remove $and if no filters
    if (!filterQuery.$and.length) {
      delete filterQuery.$and;
    }

    const pipeline = [
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          hasPurchased: true,
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseDetails",
        },
      },
      {
        $unwind: "$courseDetails",
      },
      {
        $match: {
          "courseDetails.isPublished": true,
        },
      },

    ];

    if (filterQuery.$and?.length) {
      pipeline.push({
        $match: {
          $and: filterQuery.$and.map((condition) => ({
            [`courseDetails.${Object.keys(condition)[0]}`]:
              Object.values(condition)[0],
          })),
        },
      });
    }

    const totalCountPipeline = [...pipeline, { $count: "count" }];

    // Paginated data pipeline
    const paginatedDataPipeline = [
      ...pipeline,
      {
        $sort: { "courseDetails.createdAt": -1 },
      },
      { $skip: (page - 1) * limit },
      { $limit: Number(limit) },
    ];

    // Execute pipelines
    const [totalCountResult, paginatedData] = await Promise.all([
      Purchase.aggregate(totalCountPipeline),
      Purchase.aggregate(paginatedDataPipeline),
    ]);

    const courses = paginatedData || [];
    const totalCount = totalCountResult[0]?.count || 0;

    console.log("Purchased courses found:", courses.length);
    console.log("Total count:", totalCount);
    console.log(
      "Sample courses:",
      courses.slice(0, 2).map((c) => ({
        _id: c.courseDetails._id,
        courseName: c.courseDetails.courseName,
        coursePrice: c.courseDetails.coursePrice,
        courseType: c.courseDetails.courseType,
      }))
    );

    if (!courses.length) {
      ReqLogger(req, "info", "No purchased courses found");
      return res.status(200).json({
        success: true,
        message: "No purchased courses found",
        data: [],
        meta: {
          currentPage: Number(page),
          perPage: Number(limit),
          total: totalCount,
        },
      });
    }

    // Process course data
    const simplifiedCourses = await Promise.all(
      courses.map(async (c) => {
        const populatedCourse = await Course.findById(
          c.courseDetails._id
        ).populate({
          path: "modules",
          match: { status: "published" },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: "published" },
            options: { sort: { order: 1 } },
          },
        });

        const totalLecturesCount = populatedCourse.modules.reduce(
          (sum, mod) => sum + (mod.lectures?.length || 0),
          0
        );

        return {
          _id: c.courseDetails._id,
          courseId: c.courseDetails.courseId,
          courseType: c.courseDetails.courseType,
          courseName: c.courseDetails.courseName,
          description: c.courseDetails.description,
          courseCategory: c.courseDetails.courseCategory,
          lectures: populatedCourse.modules.flatMap((mod) =>
            mod.lectures.map((lec) => lec._id.toString())
          ),
          totalLecturesCount,
          modules: populatedCourse.modules,
          courseImage: c.courseDetails.courseImage
            ? await getSignedUrlFile(c.courseDetails.courseImage)
            : null,
          createdAt: c.courseDetails.createdAt,
          coursePrice: c.courseDetails.coursePrice,
          isPublished: c.courseDetails.isPublished,
          isPurchased: true,
        };
      })
    );

    ReqLogger(req, "info", "Purchased courses retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Purchased courses retrieved successfully",
      data: simplifiedCourses,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error in getPurchasedCourse:", error.message);
    ReqLogger(
      req,
      "error",
      `Error retrieving purchased courses: ${error.message}`
    );
    return next(error);
  }
};

exports.getInProgressCourse = async (req, res, next) => {
  try {
    const user = req.user?._id;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const skip = (page - 1) * limit;

    const countAggregate = await Purchase.aggregate([
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseDetails",
        },
      },
      { $unwind: "$courseDetails" },
      {
        $match: {
          user: new ObjectId(user),
          hasPurchased: true,
          "courseDetails.status": "published",
        },
      },
      { $count: "count" },
    ]);

    const totalCount = countAggregate[0]?.count || 0;

    const purchases = await Purchase.aggregate([
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseDetails",
        },
      },
      { $unwind: { path: "$courseDetails", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          user: new ObjectId(user),
          hasPurchased: true,
        },
      },
      { $sort: { lastOpenedAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const purchaseIds = purchases.filter((p) => p._id).map((p) => p._id);

    if (purchaseIds.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No in-progress courses found",
        data: [],
        meta: {
          currentPage: page,
          perPage: limit,
          total: totalCount,
        },
      });
    }

    const populatedCourses = await Purchase.find({ _id: { $in: purchaseIds } })
      .populate({
        path: "course",
        match: { status: "published" },
        populate: [
          {
            path: "modules",
            match: { status: "published" },
            options: { sort: { order: 1 } },
            populate: {
              path: "lectures",
              match: { status: "published" },
              options: { sort: { order: 1 } },
              populate: [
                { path: "videoSrc" },
                {
                  path: "quiz",
                  select: "name quizType",
                  populate: { path: "questions" },
                },
              ],
            },
          },
          { path: "created_by" },
        ],
      })
      .lean();

    const validCourses = populatedCourses.filter((pc) => pc?.course);

    const simplifiedCourses = await Promise.all(
      validCourses.map(async (pc) => {
        const courseObj = pc.toObject ? pc.toObject() : pc;

        const modules = courseObj.course?.modules || [];
        const totalLecturesCount = modules.reduce(
          (sum, mod) => sum + (mod.lectures?.length || 0),
          0
        );

        let courseImage = null;
        if (courseObj.course?.courseImage) {
          courseImage = await getSignedUrlFile(courseObj.course.courseImage);
        }

        const cleanLectureIds = modules.flatMap(
          (mod) => mod.lectures?.map((lec) => lec._id.toString()) || []
        );

        return {
          _id: courseObj._id,
          courseId: courseObj.course?.courseId,
          courseType: courseObj.course?.courseType,
          courseName: courseObj.course?.courseName,
          description: courseObj.course?.description,
          courseCategory: courseObj.course?.courseCategory,
          lectures: courseObj.lectures || [],
          lastOpenedAt: courseObj.lastOpenedAt,
          course: {
            ...courseObj.course,
            totalLecturesCount,
            lectures: cleanLectureIds,
            modules,
            courseImage,
          },
          isPurchased: true,
        };
      })
    );

    ReqLogger(req, "info", "In-progress courses retrieved successfully.");
    return res.status(200).json({
      status: "success",
      message: "In-progress courses retrieved successfully",
      data: simplifiedCourses,
      meta: {
        currentPage: page,
        perPage: limit,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("getInProgressCourse error:", error);
    return next(error);
  }
};

exports.getPurchasedCourseById = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const user = req.user?._id;

    const purchasedCourse = await Purchase.findOne({
      course: new ObjectId(courseId),
      user: new ObjectId(user),
      hasPurchased: true,
    })
      .populate({
        path: "course",
        populate: [
          {
            path: "modules",
            match: { status: { $eq: "published" } },
            options: { sort: { order: 1 } },
            populate: {
              path: "lectures",
              match: { status: { $eq: "published" } },
              options: { sort: { order: 1 } },
              populate: [
                {
                  path: "videoSrc",
                },
                {
                  path: "quiz",
                  select: "name quizType",
                  populate: {
                    path: "questions",
                    select:
                      "question_number question options questionType isMultipleAnswer",
                  },
                },
              ],
            },
          },
          {
            path: "created_by",
          },
        ],
      })
      .lean();

    if (!purchasedCourse) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located.",
        success: false,
      });
    }

    if (purchasedCourse?.course?.courseImage) {
      purchasedCourse.course.courseImage = await getSignedUrlFile(
        purchasedCourse.course.courseImage
      );
    }

    let validLectureIds = [];
    if (purchasedCourse?.course?.modules?.length) {
      for await (const courseModule of purchasedCourse.course.modules) {
        if (!courseModule?.lectures?.length) continue;

        for (const lecture of courseModule.lectures) {
          // Add lecture ID to validLectureIds
          validLectureIds.push(lecture._id.toString());

          // Check lecture progress
          const lectureProgress = purchasedCourse.lectures?.find(
            (_l) => _l?.lecture?.toString() === lecture._id.toString()
          );

          if (lectureProgress) {
            lecture.progress = lectureProgress.progress || 0;
            lecture.completedAt = lectureProgress.completedAt || null;
          } else {
            lecture.progress = 0;
            lecture.completedAt = null;
          }

          if (lecture?.videoSrc?.url?.trim()) {
            lecture.videoSrc.url = await getSignedUrlFile(lecture.videoSrc.url);
          }

          // Generate signed URL for lecture documents
          if (
            lecture?.document?.key &&
            typeof lecture.document.key === "string" &&
            lecture.document.key.trim()
          ) {
            lecture.document.url = await getSignedUrlFile(lecture.document.key);
          }
        }
      }
    }

    // Calculate total lectures count
    const totalLecturesCount = validLectureIds.length;

    // Debug log to verify lecture count
    console.log("Valid Lecture IDs:", validLectureIds);
    console.log("Total Lectures Count:", totalLecturesCount);

    const { lectures, ...courseWithoutLectures } = purchasedCourse; // Remove old lectures

    ReqLogger(req, "info", "Course successfully retrieved.");
    return res.status(200).json({
      status: "success",
      message: "Course successfully retrieved.",
      data: {
        ...courseWithoutLectures,
        course: {
          ...purchasedCourse.course,
          totalLecturesCount,
          lectures: validLectureIds, // Return lecture IDs like getAllCourse
        },
        totalLecturesCount,
        isCoursePurchased: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyPayment = async (req, res, next) => {
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

    const purchase = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
    }).populate([
      {
        path: "course",
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

    // Select the appropriate Stripe instance based on the organization
    let stripeInstance;
    const isPrescientOrg =
      purchase.organization._id.toString() === config.prescientOrgId;

    if (isPrescientOrg) {
      // Use the platform Stripe instance
      stripeInstance = stripe;
    } else {
      // Use the organization's Stripe instance
      if (!purchase.organization.stripeSecretKey) {
        return res.status(400).json({
          error: "Organization's Stripe account not configured",
        });
      }
      stripeInstance = require("stripe")(purchase.organization.stripeSecretKey);
    }

    const session = await stripeInstance.checkout.sessions.retrieve(
      purchase.sessionId
    );

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
      const paymentIntent = await stripeInstance.paymentIntents.retrieve(
        session.payment_intent
      );

      if (!session.customer) {
        stripeCustomer = await stripeInstance.customers.create({
          email: session.customer_details.email,
          name: session.customer_details.name,
          metadata: {
            purchaseId: purchaseId,
          },
        });
        console.log("Created new customer:", stripeCustomer.id);
      } else {
        stripeCustomer = await stripeInstance.customers.retrieve(
          session.customer
        );
      }

      // Create a single invoice for the organization
      const invoice = await stripeInstance.invoices.create({
        customer: stripeCustomer.id,
        auto_advance: true,
        collection_method: "charge_automatically",
        metadata: {
          purchaseId,
          type: isPrescientOrg ? "prescient" : "organization",
          organizationId: purchase.organization._id.toString(),
        },
        description: `Course Purchase: ${purchase.course.courseName}`,
      });

      await stripeInstance.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: paymentIntent.amount,
        currency: "usd",
        description: `Course: ${purchase.course.courseName}`,
      });

      const finalizedInvoice = await stripeInstance.invoices.finalizeInvoice(
        invoice.id
      );
      const paidInvoice = await stripeInstance.invoices.pay(invoice.id, {
        paid_out_of_band: true,
      });

      // Create a single invoice record in the database
      const courseInvoice = new CourseInvoice({
        purchase: purchase._id,
        course: purchase.course._id,
        user: purchase.user,
        organization: purchase.organization._id,
        amount: paymentIntent.amount / 100,
        platformFee: 0, // No platform fees with direct Stripe accounts
        organizationAmount: paymentIntent.amount / 100,
        stripeCustomerId: stripeCustomer.id,
        paymentIntentId: paymentIntent.id,
        stripeInvoiceId: invoice.id,
        organizationInvoiceId: paidInvoice.id,
        organizationInvoiceUrl: paidInvoice.hosted_invoice_url,
        status: "paid",
        metadata: {
          customerEmail: session.customer_details.email,
          customerName: session.customer_details.name,
          organizationType: isPrescientOrg ? "prescient" : "organization",
        },
      });

      await courseInvoice.save();

      // Create purchase notification
      await createPurchaseNotification({
        purchaseId: courseInvoice._id,
        organization: purchase.organization._id,
        title: "New course purchased",
        message: `New course purchased ${purchase.course.courseName}`,
      });

      // Send appropriate email notifications
      if (isPrescientOrg) {
        emailProvider.sendOrganizationPurchaseNotification(
          courseInvoice,
          purchase?.course?.courseName,
          user
        );
      } else {
        emailProvider.sendPurchaseNotifications(
          courseInvoice,
          purchase?.course?.courseName,
          user,
          purchase?.organization?.name,
          purchase?.organization?.signatoryUser?.email
        );
      }

      console.log("Course invoice created:", courseInvoice._id);

      // Handle coupon usage if applicable
      if (purchase.coupon !== null) {
        const coupon = await Coupon.findOne({
          _id: new ObjectId(purchase.coupon),
          organization: purchase?.organization._id,
        });
        coupon.usageCount += 1;
        await coupon.save();

        const couponUsage = new CouponUsage({
          coupon: coupon._id,
          user: purchase.user,
          course: purchase.courseId,
          usedAt: new Date(),
          organization: purchase?.organization._id,
        });
        await couponUsage.save();
      }

      // Update purchase record
      purchase.stripeCustomerId = stripeCustomer.id;
      purchase.paymentId = session.payment_intent;
      purchase.hasPurchased = true;
      await purchase.save();

      // Send course purchase email
      emailProvider.sendCoursePurchased(purchase?.course?.courseName, user);

      // Double-check we only created one invoice
      const allInvoices = await CourseInvoice.find({
        purchase: new ObjectId(purchaseId),
      });

      console.log(`Number of invoices after creation: ${allInvoices.length}`);

      if (allInvoices.length > 1) {
        console.error("Multiple invoices detected:", allInvoices);
      }

      ReqLogger(req, "info", "Payment was successful.");
      return res.send("Payment successful");
    }

    // Payment wasn't successful
    await Purchase.deleteOne({
      _id: new ObjectId(purchaseId),
      organization: purchase?.organization._id,
    });

    emailProvider.sendPaymentCancel(purchase.course.courseName, user);
    ReqLogger(req, "info", "Payment was not successful.");
    return res.status(200).send("Payment was not successful.");
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

// exports.verifyPayment = async (req, res, next) => {
//   try {
//     const { purchaseId } = req.body;
//     const config = getConfig();

//     const existingInvoices = await CourseInvoice.find({
//       purchase: new ObjectId(purchaseId),
//     });

//     if (existingInvoices.length > 0) {
//       console.log(
//         "Found existing invoices for purchase:",
//         purchaseId,
//         existingInvoices
//       );
//       return res.status(400).json({
//         success: true,
//         message: "Payment already processed",
//         existingInvoices,
//       });
//     }

//     const purchase = await Purchase.findOne({
//       _id: new ObjectId(purchaseId),
//     }).populate([
//       {
//         path: "course",
//       },
//       {
//         path: "organization",
//         populate: {
//           path: "signatoryUser",
//         },
//       },
//     ]);
//     if (!purchase) {
//       ReqLogger(req, "error", "No purchase record found.");
//       return res.status(404).json({ error: "No purchase record found." });
//     }
//     const session = await stripe.checkout.sessions.retrieve(purchase.sessionId);

//     const existingInvoiceByPaymentIntent = await CourseInvoice.findOne({
//       paymentIntentId: session.payment_intent,
//     });

//     if (existingInvoiceByPaymentIntent) {
//       console.log(
//         "Found existing invoice for payment intent:",
//         session.payment_intent
//       );
//       return res.status(400).json({
//         success: true,
//         message: "Payment already processed",
//         invoice: existingInvoiceByPaymentIntent,
//       });
//     }
//     const user = await User.findOne({ _id: purchase?.user });

//     let stripeCustomer;

//     if (session.payment_status === "paid") {
//       const paymentIntent = await stripe.paymentIntents.retrieve(
//         session.payment_intent
//       );

//       if (!session.customer) {
//         stripeCustomer = await stripe.customers.create({
//           email: session.customer_details.email,
//           name: session.customer_details.name,
//           metadata: {
//             purchaseId: purchaseId,
//           },
//         });

//         console.log("Created new customer:", stripeCustomer.id);
//       } else {
//         stripeCustomer = await stripe.customers.retrieve(session.customer);
//       }

//       if (purchase.isConnectedAccount) {
//         const [orgInvoice, platformInvoice] = await Promise.all([
//           // Organization invoice
//           stripe.invoices
//             .create({
//               customer: stripeCustomer.id,
//               auto_advance: true,
//               collection_method: "charge_automatically",
//               metadata: {
//                 purchaseId,
//                 type: "organization",
//                 organizationId: purchase.organization._id.toString(),
//               },
//               description: `Course Purchase: ${purchase.course.courseName}`,
//             })
//             .then(async (invoice) => {
//               await stripe.invoiceItems.create({
//                 customer: stripeCustomer.id,
//                 invoice: invoice.id,
//                 amount:
//                   paymentIntent.amount - paymentIntent.application_fee_amount,
//                 currency: "usd",
//                 description: `Course: ${purchase.course.courseName}`,
//               });

//               const finalizedInvoice = await stripe.invoices.finalizeInvoice(
//                 invoice.id
//               );
//               const paidInvoice = await stripe.invoices.pay(invoice.id, {
//                 paid_out_of_band: true,
//               });

//               return paidInvoice;
//             }),

//           // Platform (Precient) invoice
//           stripe.invoices
//             .create({
//               customer: stripeCustomer.id,
//               auto_advance: true,
//               collection_method: "charge_automatically",
//               metadata: {
//                 purchaseId,
//                 type: "platform",
//                 organizationId: config.prescientOrgId,
//               },
//               description: "Platform Fee",
//             })
//             .then(async (invoice) => {
//               await stripe.invoiceItems.create({
//                 customer: stripeCustomer.id,
//                 invoice: invoice.id,
//                 amount: paymentIntent.application_fee_amount,
//                 currency: "usd",
//                 description: `Platform Fee for Course: ${purchase.course.courseName}`,
//               });

//               const finalizedInvoice = await stripe.invoices.finalizeInvoice(
//                 invoice.id
//               );
//               const paidInvoice = await stripe.invoices.pay(invoice.id, {
//                 paid_out_of_band: true,
//               });

//               return paidInvoice;
//             }),
//         ]);
//         // Store both invoices
//         const courseInvoice = new CourseInvoice({
//           purchase: purchase._id,
//           course: purchase.course._id,
//           user: purchase.user,
//           organization: purchase.organization._id,
//           amount: paymentIntent.amount / 100,
//           platformFee: paymentIntent.application_fee_amount / 100,
//           organizationAmount:
//             (paymentIntent.amount - paymentIntent.application_fee_amount) / 100,
//           stripeCustomerId: stripeCustomer.id,
//           paymentIntentId: paymentIntent.id,
//           // Organization invoice details
//           organizationInvoiceId: orgInvoice.id,
//           organizationInvoiceUrl: orgInvoice.hosted_invoice_url,
//           // Platform invoice details
//           platformInvoiceId: platformInvoice.id,
//           platformInvoiceUrl: platformInvoice.hosted_invoice_url,
//           status: "paid",
//           metadata: {
//             customerEmail: session.customer_details.email,
//             customerName: session.customer_details.name,
//             platformOrganizationId: config?.prescientOrgId,
//           },
//         });

//         await courseInvoice.save();

//         await createPurchaseNotification({
//           purchaseId: courseInvoice?._id,
//           organization: purchase.organization._id,
//           title: "New course purchased",
//           message: `New course purchased ${purchase.course.courseName}`,
//         });

//         emailProvider.sendPurchaseNotifications(
//           courseInvoice,
//           purchase?.course?.courseName,
//           user,
//           purchase?.organization?.name,
//           purchase?.organization?.signatoryUser?.email
//         );
//         console.log(
//           "Course invoice created for both platform and organization:",
//           courseInvoice
//         );
//       } else {
//         console.log("here------------->", session);
//         // Precient organization invoice
//         const invoice = await stripe.invoices.create({
//           customer: stripeCustomer.id,
//           auto_advance: true,
//           collection_method: "charge_automatically",
//           metadata: {
//             purchaseId,
//             type: "prescient",
//           },
//           description: `Course Purchase: ${purchase.course.courseName}`,
//         });

//         await stripe.invoiceItems.create({
//           customer: stripeCustomer.id,
//           invoice: invoice.id,
//           amount: paymentIntent.amount,
//           currency: "usd",
//           description: `Course: ${purchase.course.courseName}`,
//         });

//         const finalizedInvoice = await stripe.invoices.finalizeInvoice(
//           invoice.id
//         );

//         const paidInvoice = await stripe.invoices.pay(invoice.id, {
//           paid_out_of_band: true,
//         });

//         const courseInvoice = new CourseInvoice({
//           purchase: purchase._id,
//           course: purchase.course._id,
//           user: purchase.user,
//           organization: config?.prescientOrgId,
//           amount: paymentIntent.amount / 100,
//           platformFee: 0,
//           organizationAmount: paymentIntent.amount / 100,
//           stripeCustomerId: stripeCustomer.id,
//           paymentIntentId: paymentIntent.id,
//           stripeInvoiceId: invoice.id,
//           platformInvoiceId: paidInvoice.id,
//           platformInvoiceUrl: paidInvoice.hosted_invoice_url,
//           status: "paid",
//           metadata: {
//             customerEmail: session.customer_details.email,
//             customerName: session.customer_details.name,
//             type: "prescient",
//           },
//         });

//         await courseInvoice.save();

//         await createPurchaseNotification({
//           purchaseId: courseInvoice._id,
//           organization: purchase.organization._id,
//           title: "New course purchased",
//           message: `New course purchased ${purchase.course.courseName}`,
//         });
//         emailProvider.sendOrganizationPurchaseNotification(
//           courseInvoice,
//           purchase?.course?.courseName,
//           user
//         );
//         console.log("Course invoice created:", courseInvoice._id);
//       }
//       if (purchase.coupon !== null) {
//         const coupon = await Coupon.findOne({
//           _id: new ObjectId(purchase.coupon),
//           organization: purchase?.organization._id,
//         });
//         coupon.usageCount += 1;
//         await coupon.save();
//         const couponUsage = new CouponUsage({
//           coupon: coupon._id,
//           user: purchase.user,
//           course: purchase.courseId,
//           usedAt: new Date(),
//           organization: purchase?.organization._id,
//         });
//         await couponUsage.save();
//       }
//       purchase.stripeCustomerId = stripeCustomer.id;
//       purchase.paymentId = session.payment_intent;
//       purchase.hasPurchased = true;
//       await purchase.save();
//       emailProvider.sendCoursePurchased(purchase?.course?.courseName, user);
//       const allInvoices = await CourseInvoice.find({
//         purchase: new ObjectId(purchaseId),
//       });
//       console.log(`Number of invoices after creation: ${allInvoices.length}`);
//       if (allInvoices.length > 1) {
//         console.error("Multiple invoices detected:", allInvoices);
//       }
//       ReqLogger(req, "info", "Payment was successful.");
//       return res.send("Payment successful");
//     }
//     await Purchase.deleteOne({
//       _id: new ObjectId(purchaseId),
//       organization: purchase?.organization._id,
//     });
//     emailProvider.sendPaymentCancel(purchase.course.courseName, user);
//     ReqLogger(req, "info", "Payment was not successful.");
//     return res.status(200).send("Payment was not successful.");
//   } catch (error) {
//     console.log(error);
//     return next(error);
//   }
// };

exports.updateLastOpenedAt = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const user = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const purchase = await Purchase.findOne({
      user: user,
      course: new ObjectId(courseId),
      // ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!purchase) {
      ReqLogger(req, "error", "No purchase record found.");
      return res.status(404).json({ error: "No purchase record found." });
    }

    await Purchase.updateOne(
      {
        user: req.user._id,
        course: new ObjectId(courseId),
        organization: purchase?.organization,
      },
      { lastOpenedAt: Date.now() }
    );

    ReqLogger(req, "info", "Course updated successfully");
    return res.status(200).send({ message: "Course updated successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.addCourseModuleAndLectures = async (req, res, next) => {
  try {
    const { moduleId, lectureId } = req.body;
    const { purchaseId } = req.params;
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const purchasedCourse = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      user: new ObjectId(userId),
      // ...(!isSuperAdmin
      //   ? {
      //     $or: [
      //       { organization: new ObjectId(organization) },
      //       { coursePrivacy: "public" },
      //     ],
      //   }
      //   : {}),
    }).exec();

    if (!purchasedCourse) {
      ReqLogger(req, "info", "Purchased course not found.");
      return res.status(400).json({
        status: "error",
        message: "Purchased course not found",
      });
    }

    if (!purchasedCourse?.hasPurchased) {
      ReqLogger(req, "info", "Please verify the purchase first");
      return res.status(400).json({
        status: "error",
        message: "Please verify the purchase first",
      });
    }

    //check if previous course progress is complete
    // const arePreviousLecturesCompleted = purchasedCourse?.lectures?.find(item => item?.progress !== 100);

    // if (arePreviousLecturesCompleted) {
    //   ReqLogger(req, "info", "Please complete previous lectures to watch this lecture");
    //   return res.status(400).json({
    //     status: "error",
    //     message: "Please complete previous lectures to watch this lecture",
    //   });
    // }

    const existingModule = purchasedCourse?.modules?.find(
      (item) => item?.module.toString() === moduleId?.toString()
    );
    if (!existingModule) {
      purchasedCourse?.modules?.push({ module: moduleId, progress: 0 });
    }

    const existingLecuture = purchasedCourse?.lectures?.find(
      (item) => item?.lecture.toString() === lectureId?.toString()
    );
    if (!existingLecuture) {
      purchasedCourse?.lectures?.push({ lecture: lectureId, progress: 0 });
    }

    await purchasedCourse?.save();

    ReqLogger(req, "info", "Purchased course updated successfully.");
    return res.status(200).json({
      status: "success",
      message: "Purchased course updated successfully.",
      result: purchasedCourse,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateLectureProgress = async (req, res, next) => {
  try {
    const { lectureId, progress } = req.body;
    const { purchaseId } = req.params;
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const purchasedCourse = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      user: new ObjectId(userId),
      // ...(!isSuperAdmin
      //   ? {
      //     $or: [
      //       { organization: new ObjectId(organization) },
      //       { coursePrivacy: "public" },
      //     ],
      //   }
      //   : {}),
    }).exec();

    if (!purchasedCourse) {
      ReqLogger(req, "info", "Purchased course not found.");
      return res.status(400).json({
        status: "error",
        message: "Purchased course not found",
      });
    }

    if (!purchasedCourse?.hasPurchased) {
      ReqLogger(req, "info", "Please verify the purchase first");
      return res.status(400).json({
        status: "error",
        message: "Please verify the purchase first",
      });
    }

    await Purchase.updateOne(
      {
        _id: new ObjectId(purchaseId),
        user: new ObjectId(userId),
        organization: purchasedCourse?.organization,
        "lectures.lecture": lectureId,
      },
      {
        $set: {
          "lectures.$.progress": progress,
          "lectures.$.completedAt": progress === 100 ? new Date() : null,
        },
      }
    );

    await this.updateCourseModuleProgress(
      lectureId,
      purchaseId,
      userId,
      purchasedCourse?.organization
    );

    ReqLogger(req, "info", "Purchased course updated successfully.");
    return res.status(200).json({
      status: "success",
      message: "Purchased course updated successfully.",
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourseModuleProgress = async (
  lectureId,
  purchaseId,
  userId,
  organization
) => {
  try {
    const lecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization,
    });

    if (!lecture || !lecture?.module) {
      InfoLogger(
        {},
        "error",
        "Error updating module progress: Lecture not found"
      );
      return;
    }

    const courseModule = await CourseModule.findOne({
      _id: lecture?.module,
      organization,
    });
    if (!courseModule) {
      InfoLogger(
        {},
        "error",
        "Error updating module progress: Module not found"
      );
      return;
    }

    const purchasedCourse = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      user: new ObjectId(userId),
      organization,
    }).exec();

    const totalModuleLecture = courseModule?.lectures?.length;

    if (totalModuleLecture === 0) {
      InfoLogger(
        {},
        "error",
        "Error updating module progress: Module has no lectures to calculate progress"
      );
      return;
    }

    const completedModuleLecture = purchasedCourse?.lectures.filter(
      (courseLecture) =>
        courseModule?.lectures?.some((l) =>
          l?.equals(courseLecture?.lecture)
        ) && courseLecture?.progress === 100
    );

    const progress =
      (completedModuleLecture?.length / totalModuleLecture) * 100;

    await Purchase.updateOne(
      {
        _id: new ObjectId(purchasedCourse?._id),
        user: new ObjectId(purchasedCourse?.user),
        organization,
        "modules.module": courseModule?._id,
      },
      {
        $set: {
          "modules.$.progress": progress,
          "modules.$.completedAt": progress === 100 ? new Date() : null,
          "modules.$.completedCreditHours":
            progress === 100 ? courseModule?.completedCreditHours || 0 : 0,
        },
      }
    );

    InfoLogger({}, "info", "Successfully updated module progress");
  } catch (error) {
    InfoLogger(
      {},
      "error",
      `Error updating module progress: ${JSON.stringify(error)}`
    );
  }
};
