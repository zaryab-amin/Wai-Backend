const { v4: uuidv4 } = require("uuid");
const Course = require("../models/course.model");
const CourseLecture = require("../models/courseLecture.model");
const User = require("../models/user.model");
const Purchase = require("../models/purchase.model");
const CourseTemplate = require("../models/courseTemplate.model");
const emailProvider = require("../services/emails/emailProvider");
const Token = require("../models/token.model");
const jwt = require("jsonwebtoken");
const { ReqLogger } = require("../utils/Logger");
const { getSignedUrlFile, uploadFile } = require("./gcs.controller");
const { InvokeCommand, LambdaClient } = require("@aws-sdk/client-lambda");
const { stripHtml, sanitizeTemplate } = require("../utils/sanitize");
const Invite = require("../models/invite.model");
const { queryBuilder } = require("../utils/queryBuilder");
const mongoose = require("mongoose");
const certificateModel = require("../models/certificate.model");
const {
  createCourseSchema,
  courseStatusSchema,
  coursePrivacySchema,
} = require("../validations/course.validation");
const { ObjectId } = require("mongodb");
const CourseModule = require("../models/courseModule.model");
const { isSuperAdminUser } = require("../utils");
const Organization = require("../models/organization.model");
const { getConfig } = require("../../config/vars");

const client = new LambdaClient({
  region: "us-east-1",
});

const invoke = async (funcName, payload) => {
  const command = new InvokeCommand({
    FunctionName: funcName,
    Payload: JSON.stringify(payload),
  });

  const { Payload } = await client.send(command);
  const result = Buffer.from(Payload).toString();
  return JSON.parse(result || "{}");
};

const allowedExtensions = ["png", "jpg", "jpeg"];

exports.createCourse = async (req, res, next) => {
  try {
    const { payload } = req.body;
    const created_by = req.user?._id;
    const organization = req.user?.organization;
    const file = req?.file;

    const coursePayload = JSON.parse(payload);

    const {
      courseName,
      courseCategory,
      difficultyLevel = "beginner",
      description,
      courseType,
      courseSkills = [],
      courseRequirements = [],
      certificateDescription,
      coursePrice,
    } = coursePayload;

    await createCourseSchema.validateAsync({
      courseName,
      courseCategory,
      difficultyLevel,
      description,
      courseType,
      courseSkills,
      courseRequirements,
      certificateDescription,
      coursePrice,
    });

    let courseImageKey = "";
    let courseImageUrl = "";
    if (file) {
      const extension = file.originalname?.split(".").pop()?.toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return res
          .status(400)
          .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
      }
      const uploaded = await uploadFile(file, "course-images");
      courseImageKey = uploaded.key;
      courseImageUrl = uploaded.url;
    }

    const courseId = uuidv4({ format: "hex" });

    const sanitizedDescription = sanitizeTemplate(description);
    const sanitizedCertificateDescription = sanitizeTemplate(
      certificateDescription
    );
    const sanitizedCourseSkills = courseSkills?.map(sanitizeTemplate);
    const sanitizedCourseRequirements =
      courseRequirements?.map(sanitizeTemplate);

    const newCourse = await Course.create({
      courseId,
      courseName,
      courseImage: courseImageKey,
      courseCategory,
      difficultyLevel,
      description: sanitizedDescription,
      courseType,
      courseSkills: sanitizedCourseSkills,
      courseRequirements: sanitizedCourseRequirements,
      certificateDescription: sanitizedCertificateDescription,
      coursePrice,
      created_by,
      status: "draft",
      organization: new ObjectId(organization),
    });

    const moduleId = uuidv4({ format: "hex" });
    const courseModule = await CourseModule.create({
      moduleTitle: "Section 01: Introduction",
      course: newCourse._id,
      status: "published",
      order: 1,
      moduleId,
      organization: new ObjectId(organization),
    });

    await Course.updateOne(
      { _id: newCourse._id },
      { $push: { modules: courseModule._id } }
    );

    emailProvider.sendCourseCreation(newCourse.courseName, req?.user);
    ReqLogger(req, "info", "Course created successfully");

    const responseCourse = newCourse.toObject();
    if (responseCourse.courseImage) {
      responseCourse.courseImage =
        courseImageUrl || (await getSignedUrlFile(responseCourse.courseImage));
    }

    return res.json({
      message: "Course created successfully",
      course: responseCourse,
    });
  } catch (error) {
    return next(error);
  }
};

exports.createCourseByTemplate = async (req, res, next) => {
  try {
    const data = req.body;
    const { templateId, courseName } = data;
    const template = await CourseTemplate.findOne({
      templateCourseId: templateId,
    }).exec();
    if (!template) {
      ReqLogger(
        req,
        "error",
        "Template Not Found: The specified template could not be located. Please check the template ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Template Not Found: The specified template could not be located. Please check the template ID or name and try again.",
        success: false,
      });
    }
    if (template.created_by.toString() !== req.user._id.toString()) {
      ReqLogger(req, "error", "You're not Authorized");
      return res.status(405).json({
        status: "error",
        message: "You're not Authorized",
        data: {},
      });
    }
    const courseId = uuidv4({ format: "hex" });
    const body = {
      courseId: courseId,
      courseName: courseName,
      description: template.description,
      courseType: template.courseType,
      lectures: template.lectures,
      created_by: req.user._id,
      organization: req.user.organization,
      coursePrice: template.coursePrice,
      certificateDescription: template.certificateDescription,
    };
    const course = await new Course(body).save();
    ReqLogger(req, "info", "Course created successfully");
    return res.status(201).json({
      status: "success",
      message: "course Created successfully",
      data: course,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCourse = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    // First get the course details
    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      $or: [
        {
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        },
        { coursePrivacy: "public" },
      ],
    })
      .populate("created_by", "_id name")
      .populate({
        path: "modules",
        match: { status: { $eq: "published" } },
        options: { sort: { order: 1 } },
        populate: {
          path: "lectures",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
        },
      })
      .exec();

    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(400).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    if (course?.status !== "published") {
      return res.status(400).json({
        message: "Course not found: The specified course could not be located.",
        success: false,
      });
    }

    // Calculate lecture type counts from populated lectures
    const lectureTypeCounts = {
      lecture: 0,
      quiz: 0,
      textLecture: 0,
      videoLecture: 0,
    };

    const validLectureIds = course.modules.flatMap((module) =>
      module.lectures.map((lecture) => {
        if (
          lecture.lectureType &&
          lectureTypeCounts.hasOwnProperty(lecture.lectureType)
        ) {
          lectureTypeCounts[lecture.lectureType]++;
        } else {
          console.warn(`Invalid lectureType for lecture ID: ${lecture._id}`);
        }
        return lecture._id.toString();
      })
    );

    const isCoursePurchased = await Purchase.findOne({
      user: new ObjectId(req.user._id),
      course: course?._id,
      hasPurchased: true,
    }).exec();

    if (course?.courseImage) {
      course.courseImage = await getSignedUrlFile(course?.courseImage);
    }

    ReqLogger(req, "info", "Course successfully retrieved.");
    return res.status(200).json({
      status: "success",
      message: "Course successfully retrieved.",
      data: {
        ...course.toObject(),
        lectures: validLectureIds,
        lectureTypeCounts,
      },
      isCoursePurchased: !!isCoursePurchased,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCourseForAdmin = async (req, res, next) => {
  try {
    const userId = req?.user?._id;
    const courseId = req.params.courseId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("created_by", "_id name")
      .populate({
        path: "modules",
        options: { sort: { order: 1 } },
        populate: {
          path: "lectures",
          populate: [
            {
              path: "videoSrc",
            },
            {
              path: "quiz",
              populate: {
                path: "questions",
              },
            },
          ],
          options: { sort: { order: 1 } },
        },
      })
      .exec();

    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(400).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    if (course?.created_by?._id?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action." });
    }

    // Handle course image signed URL only if it exists and is a valid string
    if (
      course?.courseImage &&
      typeof course.courseImage === "string" &&
      course.courseImage.trim()
    ) {
      course.courseImage = await getSignedUrlFile(course.courseImage);
    }

    // Handle course document signed URL only if key exists and is a valid string
    if (
      course?.courseDocument?.key &&
      typeof course.courseDocument.key === "string" &&
      course.courseDocument.key.trim()
    ) {
      course.courseDocument.url = await getSignedUrlFile(
        course.courseDocument.key
      );
    }

    // Handle lecture videoSrc signed URLs
    if (course?.modules?.length) {
      for (const courseModule of course.modules) {
        if (!courseModule?.lectures?.length) {
          continue;
        }
        for (const lecture of courseModule.lectures) {
          if (
            lecture?.videoSrc &&
            lecture.videoSrc.url &&
            typeof lecture.videoSrc.url === "string" &&
            lecture.videoSrc.url.trim()
          ) {
            lecture.videoSrc.url = await getSignedUrlFile(lecture.videoSrc.url);
          }

          // Regenerate signed URL for lecture documents
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

    ReqLogger(req, "info", "Course successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Course successfully retrieved.",
      data: course,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCourseByUser = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const course = await Course.find({
      created_by: req.user._id,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate({
        path: "modules",
        match: { status: { $eq: "published" } },
        options: { sort: { order: 1 } },
        populate: {
          path: "lectures",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
        },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    const simplifiedCourse = [];

    for (const c of course) {
      if (c.courseImage) {
        c.courseImage = await getSignedUrlFile(c.courseImage);
      }

      simplifiedCourse.push({
        _id: c._id,
        courseId: c.courseId,
        courseType: c.courseType,
        courseName: c.courseName,
        description: c.description,
        lectures: c.lectures,
        courseImage: c.courseImage,
        createdAt: c.createdAt,
        coursePrice: c.coursePrice,
        isPublished: c.isPublished,
      });
    }

    ReqLogger(req, "info", "Course successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Course successfully retrieved.",
      data: simplifiedCourse,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAllCourse = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      courseType,
      courseTypeFilter,
      search,
      category,
      difficultyLevel,
      minAmount,
      maxAmount,
      pricing,
    } = req.query;
    const { role } = req.user;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    // Build search and filter query
    const filterQuery = {
      $and: [],
    };

    // Add search conditions
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
    if (courseTypeFilter) {
      if (pricing && pricing !== "allCourses") {
        if (pricing === "freeCourse") {
          filterQuery.$and.push({ coursePrice: 0 });
        } else if (pricing === "premiumCourse") {
          filterQuery.$and.push({ coursePrice: { $gt: 0 } });
        } else if (pricing === "purchasedCourse") {
          const purchasedCourseIds = await getPurchasedCourseIds(req.user._id);
          filterQuery.$and.push({ _id: { $in: purchasedCourseIds } });
        }
      } else {
        if (
          !["freeCourse", "premiumCourse", "purchasedCourse"].includes(pricing)
        ) {
          if (Number(minAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
          }
          if (Number(maxAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
          }
        }
      }
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
        if (!req?.user?._id) {
          return res.status(401).json({
            success: false,
            message: "User not authenticated",
          });
        }
        const purchases = await Purchase.find({
          user: mongoose.Types.ObjectId(req.user._id),
        }).select("course");
        const purchasedCourseIds = purchases.map((purchase) =>
          purchase.course.toString()
        );
        filterQuery.$and.push({ _id: { $in: purchasedCourseIds } });
      }
    } else {
      // Only apply min/max if pricing is not freeCourse or premiumCourse
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

    // Base query based on role
    const baseQuery = {
      ...(!isSuperAdmin
        ? { organization: new mongoose.Types.ObjectId(organization) }
        : {}),
      // created_by: { $ne: new mongoose.Types.ObjectId(req.user._id) },
      ...(role !== "super-admin"
        ? {
            $or: [
              { coursePrivacy: "organization" },
              { coursePrivacy: "public" },
            ],
            isPublished: true,
          }
        : {}),
      // created_by: { $ne: new ObjectId(req?.user?.id) },
      ...filterQuery,
    };

    // Get courses with pagination
    const [courses, totalCount] = await Promise.all([
      Course.find(baseQuery)
        .populate({
          path: "modules",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: { $eq: "published" } },
            options: { sort: { order: 1 } },
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .exec(),
      Course.countDocuments(baseQuery),
    ]);

    if (!courses?.length) {
      ReqLogger(req, "error", "No courses found");
      return res.status(404).json({
        success: false,
        message: "No courses found",
      });
    }

    // Get purchased courses for current user
    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      user: mongoose.Types.ObjectId(req?.user?._id),
      course: { $in: courseIds },
    }).select("course");

    const purchasedCourseIds = new Set(
      purchases?.map((purchase) => purchase?.course?.toString())
    );

    // Process course data
    const simplifiedCourses = await Promise.all(
      courses.map(async (c) => {
        const validLectureIds = c.modules.flatMap((module) =>
          module.lectures.map((lecture) => lecture._id.toString())
        );
        return {
          _id: c._id,
          courseId: c.courseId,
          courseType: c.courseType,
          courseName: c.courseName,
          description: c.description,
          courseCategory: c.courseCategory,
          difficultyLevel: c.difficultyLevel,
          lectures: validLectureIds,
          modules: c.modules,
          courseImage: c.courseImage
            ? await getSignedUrlFile(c.courseImage)
            : null,
          createdAt: c.createdAt,
          coursePrice: c.coursePrice,
          isPublished: c.isPublished,
          isPurchased: purchasedCourseIds.has(c?._id?.toString()),
        };
      })
    );

    ReqLogger(req, "info", "Courses retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Courses retrieved successfully",
      data: simplifiedCourses,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMarketPlaceCourses = async (req, res, next) => {
  try {
    console.log("Starting getMarketPlaceCourses");
    const {
      page = 1,
      limit = 10,
      courseType,
      courseTypeFilter,
      search,
      category,
      difficultyLevel,
      minAmount,
      maxAmount,
      pricing,
    } = req.query;
    console.log("Query params:", req.query);
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

    if (courseTypeFilter) {
      if (pricing && pricing !== "allCourses") {
        if (pricing === "freeCourse") {
          filterQuery.$and.push({ coursePrice: 0 });
        } else if (pricing === "premiumCourse") {
          filterQuery.$and.push({ coursePrice: { $gt: 0 } });
        } else if (pricing === "purchasedCourse") {
          console.log("Fetching purchased courses");
          const purchasedCourseIds = await getPurchasedCourseIds(req.user._id);
          console.log("Purchased course IDs:", purchasedCourseIds);
          filterQuery.$and.push({ _id: { $in: purchasedCourseIds } });
        }
      } else {
        if (
          !["freeCourse", "premiumCourse", "purchasedCourse"].includes(pricing)
        ) {
          if (Number(minAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
          }
          if (Number(maxAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
          }
        }
      }
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
        if (!req?.user?._id) {
          return res.status(401).json({
            success: false,
            message: "User not authenticated",
          });
        }
        const purchases = await Purchase.find({
          user: mongoose.Types.ObjectId(req.user._id),
        }).select("course");
        const purchasedCourseIds = purchases.map((purchase) =>
          purchase.course.toString()
        );
        filterQuery.$and.push({
          _id: {
            $in: purchasedCourseIds.map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        });
      }
    } else {
      if (Number(minAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
      }
      if (Number(maxAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
      }
    }
    if (!filterQuery.$and.length) {
      delete filterQuery.$and;
    }

    // Base query for marketplace courses
    const baseQuery = {
      coursePrivacy: "public",
      isPublished: true,
      status: "published",
      organization: { $ne: new mongoose.Types.ObjectId(organization) },
      ...filterQuery,
    };

    const [courses, totalCount] = await Promise.all([
      Course.find(baseQuery)
        .populate("organization")
        .populate({
          path: "modules",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: { $eq: "published" } },
            options: { sort: { order: 1 } },
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .exec(),
      Course.countDocuments(baseQuery),
    ]);

    console.log("Courses found:", courses.length);
    console.log("Total count:", totalCount);
    console.log(
      "Sample courses:",
      courses.slice(0, 2).map((c) => ({
        _id: c._id,
        courseName: c.courseName,
        coursePrice: c.coursePrice,
        courseType: c.courseType,
      }))
    );

    if (!courses?.length) {
      ReqLogger(req, "info", "No marketplace courses found");
      return res.status(200).json({
        success: true,
        message: "No marketplace courses found",
        data: [],
        meta: {
          currentPage: Number(page),
          perPage: Number(limit),
          total: 0,
        },
      });
    }

    // Get purchased courses for current user
    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      user: mongoose.Types.ObjectId(req?.user?._id),
      course: { $in: courseIds },
    }).select("course");
    const purchasedCourseIds = new Set(
      purchases?.map((purchase) => purchase?.course?.toString())
    );

    const simplifiedCourses = await Promise.all(
      courses.map(async (c) => {
        const validLectureIds = c.modules.flatMap((module) =>
          module.lectures.map((lecture) => lecture._id.toString())
        );
        return {
          _id: c._id,
          courseId: c.courseId,
          courseType: c.courseType,
          courseName: c.courseName,
          description: c.description,
          courseCategory: c.courseCategory,
          lectures: validLectureIds,
          modules: c.modules,
          courseImage: c.courseImage
            ? await getSignedUrlFile(c.courseImage)
            : null,
          createdAt: c.createdAt,
          coursePrice: c.coursePrice,
          isPublished: c.isPublished,
          organizationName: c?.organization?.name,
          isPurchased: purchasedCourseIds.has(c?._id?.toString()),
        };
      })
    );

    ReqLogger(req, "info", "Marketplace courses retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Marketplace courses retrieved successfully",
      data: simplifiedCourses,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error in getMarketPlaceCourses:", error.message);
    ReqLogger(
      req,
      "error",
      `Error retrieving marketplace courses: ${error.message}`
    );
    return next(error);
  }
};

exports.getCreatedCourses = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      courseType,
      courseTypeFilter,
      search,
      category,
      difficultyLevel,
      minAmount,
      maxAmount,
      pricing,
    } = req.query;
    console.log("Query params:", req.query);
    const userId = req?.user?._id || null;
    const organization = req?.user?.organization || null;
    const isSuperAdmin = req?.user ? isSuperAdminUser(req?.user) : false;

    if (!userId) {
      console.log("No user ID found");
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

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

    if (courseTypeFilter) {
      if (pricing && pricing !== "allCourses") {
        if (pricing === "freeCourse") {
          filterQuery.$and.push({ coursePrice: 0 });
        } else if (pricing === "premiumCourse") {
          filterQuery.$and.push({ coursePrice: { $gt: 0 } });
        } else if (pricing === "purchasedCourse") {
          console.log("Fetching purchased courses for user:", userId);
          const purchases = await Purchase.find({
            user: mongoose.Types.ObjectId(userId),
          }).select("course");
          console.log("Purchases:", purchases);
          const purchasedCourseIds = purchases.map((purchase) =>
            purchase.course.toString()
          );
          console.log("Purchased course IDs:", purchasedCourseIds);
          filterQuery.$and.push({
            _id: {
              $in: purchasedCourseIds.map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
          });
        }
      } else {
        if (
          !["freeCourse", "premiumCourse", "purchasedCourse"].includes(pricing)
        ) {
          if (Number(minAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
          }
          if (Number(maxAmount) > 0) {
            filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
          }
        }
      }
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
        console.log("Fetching purchased courses for user:", userId);
        const purchases = await Purchase.find({
          user: mongoose.Types.ObjectId(userId),
        }).select("course");
        console.log("Purchases:", purchases);
        const purchasedCourseIds = purchases.map((purchase) =>
          purchase.course.toString()
        );
        console.log("Purchased course IDs:", purchasedCourseIds);
        filterQuery.$and.push({
          _id: {
            $in: purchasedCourseIds.map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        });
      }
    } else {
      if (Number(minAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
      }
      if (Number(maxAmount) > 0) {
        filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
      }
    }

    if (!filterQuery.$and.length) {
      delete filterQuery.$and;
    }

    const baseQuery = {
      created_by: new mongoose.Types.ObjectId(userId),
      ...(!isSuperAdmin
        ? { organization: new mongoose.Types.ObjectId(organization) }
        : {}),
      ...filterQuery,
    };

    console.log("Final baseQuery:", baseQuery);

    const [courses, totalCount] = await Promise.all([
      Course.find(baseQuery)
        .populate({
          path: "modules",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: { $eq: "published" } },
            options: { sort: { order: 1 } },
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .exec(),
      Course.countDocuments(baseQuery),
    ]);

    console.log("Courses found:", courses.length);
    console.log("Total count:", totalCount);
    console.log(
      "Sample courses:",
      courses.slice(0, 2).map((c) => ({
        _id: c._id,
        courseName: c.courseName,
        coursePrice: c.coursePrice,
        courseType: c.courseType,
      }))
    );

    if (!courses?.length) {
      ReqLogger(req, "info", "No created courses found");
      return res.status(200).json({
        success: true,
        message: "No created courses found",
        data: [],
        meta: {
          currentPage: Number(page),
          perPage: Number(limit),
          total: totalCount,
        },
      });
    }

    for await (const course of courses) {
      if (course?.courseImage) {
        course.courseImage = await getSignedUrlFile(course?.courseImage);
      }
    }

    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      user: mongoose.Types.ObjectId(userId),
      course: { $in: courseIds },
    }).select("course");
    console.log("Purchases:", purchases);
    const purchasedCourseIds = new Set(
      purchases?.map((purchase) => purchase?.course?.toString())
    );

    const simplifiedCourses = await Promise.all(
      courses.map(async (c) => {
        const totalLecturesCount = c.modules.reduce((total, module) => {
          return total + (module.lectures ? module.lectures.length : 0);
        }, 0);

        const validLectureIds = c.modules.flatMap((module) =>
          module.lectures
            ? module.lectures.map((lecture) => lecture._id.toString())
            : []
        );
        return {
          _id: c._id,
          courseId: c.courseId,
          courseType: c.courseType,
          courseName: c.courseName,
          description: c.description,
          courseCategory: c.courseCategory,
          difficultyLevel: c.difficultyLevel,
          lectures: validLectureIds,
          totalLecturesCount,
          modules: c.modules,
          courseImage: c.courseImage,
          createdAt: c.createdAt,
          coursePrice: c.coursePrice,
          isPublished: c.isPublished,
          isPurchased: purchasedCourseIds.has(c?._id?.toString()),
        };
      })
    );

    ReqLogger(req, "info", "Created courses retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Created courses retrieved successfully",
      data: simplifiedCourses,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error in getCreatedCourses:", error.message);
    ReqLogger(
      req,
      "error",
      `Error retrieving created courses: ${error.message}`
    );
    return next(error);
  }
};

exports.getRecommendedCourses = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const baseQuery = {
      coursePrivacy: "public",
      isPublished: true,
      ...(!isSuperAdmin
        ? { organization: new mongoose.Types.ObjectId(organization) }
        : {}),
    };

    const [courses, totalCount] = await Promise.all([
      Course.find(baseQuery)
        .populate({
          path: "modules",
          match: { status: { $eq: "published" } },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: { $eq: "published" } },
            options: { sort: { order: 1 } },
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * Number(limit))
        .limit(Number(limit))
        .exec(),
      Course.countDocuments(baseQuery),
    ]);

    console.log("Courses found:", courses.length);
    console.log("Total count:", totalCount);
    console.log(
      "Sample courses:",
      courses.slice(0, 2).map((c) => ({
        _id: c._id,
        courseName: c.courseName,
        coursePrice: c.coursePrice,
        courseType: c.courseType,
      }))
    );

    if (!courses.length) {
      ReqLogger(req, "info", "No recommended courses found");
      return res.status(200).json({
        success: true,
        message: "No recommended courses found",
        data: [],
        meta: {
          currentPage: Number(page),
          perPage: Number(limit),
          total: totalCount,
        },
      });
    }

    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      user: mongoose.Types.ObjectId(req?.user?._id),
      course: { $in: courseIds },
    }).select("course");
    const purchasedCourseIds = new Set(
      purchases?.map((purchase) => purchase?.course?.toString())
    );

    const simplifiedCourse = await Promise.all(
      courses.map(async (c) => {
        // Only include lecture IDs that are part of published modules
        const validLectureIds = c.modules.flatMap((module) =>
          module.lectures.map((lecture) => lecture._id.toString())
        );
        return {
          _id: c._id,
          courseId: c.courseId,
          courseType: c.courseType,
          courseName: c.courseName,
          description: c.description,
          lectures: validLectureIds, // Updated to only include module lecture IDs
          modules: c.modules, // Include modules for consistency
          courseImage: c.courseImage
            ? await getSignedUrlFile(c.courseImage)
            : null,
          createdAt: c.createdAt,
          coursePrice: c.coursePrice,
          isPublished: c.isPublished,
          isPurchased: purchasedCourseIds.has(c?._id?.toString()),
        };
      })
    );

    ReqLogger(req, "info", "Recommended courses retrieved successfully");
    return res.status(200).json({
      status: "success",
      message: "Recommended courses retrieved successfully",
      data: simplifiedCourse,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error in getRecommendedCourses:", error.message);
    ReqLogger(
      req,
      "error",
      `Error retrieving recommended courses: ${error.message}`
    );
    return next(error);
  }
};

exports.deleteCourse = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const courseId = req.params.courseId;

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }
    if (course.created_by.toString() !== req.user._id.toString()) {
      return res.status(405).json({
        status: "error",
        message: "You're not Authorized",
        data: {},
      });
    }
    await Course.deleteOne({
      _id: courseId,
      organization: course?.organization,
    });

    ReqLogger(req, "info", "Course successfully retrieved.");
    return res.status(200).json({
      status: "success",
      message: "Course successfully deleted.",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourse = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { courseId } = req.params;
    console.log(req.body);
    const { payload } = req.body;
    const file = req?.file;

    console.log(payload, "listener");
    const coursePayload = JSON.parse(payload);

    const {
      courseName,
      courseCategory,
      difficultyLevel,
      description,
      courseType,
      courseSkills,
      courseRequirements,
      certificateDescription,
      coursePrice,
    } = coursePayload;

    await createCourseSchema.validateAsync({
      courseName,
      courseCategory,
      difficultyLevel,
      description,
      courseType,
      courseSkills,
      courseRequirements,
      coursePrice,
      certificateDescription,
    });

    let key = "";
    let url = "";

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    if (course?.courseImage) {
      url = await getSignedUrlFile(course?.courseImage);
    }

    if (req?.file) {
      const extension = req?.file?.originalname
        ?.split(".")
        ?.pop()
        ?.toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return res
          .status(400)
          .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
      }
      const { key: imageKey, url: imageUrl } = await uploadFile(
        file,
        "course-images"
      );
      key = imageKey;
      url = imageUrl;
    }

    if (
      course.created_by.toString() !== userId.toString() &&
      req.user.role === "admin"
    ) {
      return res.status(403).json({
        status: "error",
        message: "You're not Authorized",
        data: {},
      });
    }

    const sanitizedDescription = sanitizeTemplate(description);
    const sanitizedCourseSkills = courseSkills?.map((skill) =>
      sanitizeTemplate(skill)
    );
    const sanitizedCourseRequirements = courseRequirements?.map((requirement) =>
      sanitizeTemplate(requirement)
    );
    // console.log("courseType---------------->", courseType);
    course.courseType = courseType;
    course.courseName = courseName;
    if (url && key) {
      course.courseImage = key;
    }
    course.description = sanitizedDescription;
    course.courseCategory = courseCategory;
    course.difficultyLevel = difficultyLevel;
    course.courseType = courseType;
    course.courseSkills = sanitizedCourseSkills;
    course.courseRequirements = sanitizedCourseRequirements;
    course.coursePrice = coursePrice;
    course.certificateDescription = certificateDescription;

    await course.save();

    ReqLogger(req, "info", "Course successfully updated.");
    return res.status(200).json({
      status: "success",
      message: "Course successfully updated.",
      data: { ...course?.toObject(), courseImage: url },
    });
  } catch (error) {
    return next(error);
  }
};

exports.subscribeCourse = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { courseId } = req.body;
    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }
    const user = await User.findOne({
      _id: req.user._id,
      organization: course?.organization,
    }).exec();
    if (!user) {
      return res.status(404).json({
        message: "user does not exists",
        success: false,
      });
    }
    user.coursesSubscribed.push(course);
    await user.save();

    ReqLogger(
      req,
      "info",
      "Success! You have successfully subscribed to the course."
    );
    return res.status(200).json({
      status: "success",
      message: "Success! You have successfully subscribed to the course.",
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

exports.getSubscribedCourse = async (req, res, next) => {
  try {
    const { courseType } = req.query;

    if (courseType === "subscribed") {
      // ✅ Redirect to your subscribed course handler
      return getSubscribedCourse(req, res, next);
    }

    const {
      page = 1,
      limit = 10,
      search,
      category,
      difficultyLevel,
      minAmount,
      maxAmount,
      courseTypeFilter,
    } = req.query;

    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user._id;

    // Build filter query
    const filterQuery = {
      $and: [],
    };

    // Search filters
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

    // Category filter
    if (category?.length) {
      filterQuery.$and.push({
        courseCategory: { $in: category.split(",") },
      });
    }

    // Difficulty Level filter
    if (difficultyLevel?.length) {
      filterQuery.$and.push({
        difficultyLevel: { $in: difficultyLevel.split(",") },
      });
    }

    // Price filters
    if (Number(minAmount) > 0) {
      filterQuery.$and.push({ coursePrice: { $gte: Number(minAmount) } });
    }
    if (Number(maxAmount) > 0) {
      filterQuery.$and.push({ coursePrice: { $lte: Number(maxAmount) } });
    }

    // Apply courseTypeFilter logic based on courseType field in DB
    if (courseTypeFilter && courseTypeFilter.trim() !== "") {
      if (courseTypeFilter === "freeCourses") {
        // Show free courses or subscription courses with free subscriptionType
        filterQuery.$and.push({
          $or: [
            { courseType: "free" },
            { courseType: "subscriptionCourse", subscriptionType: "free" },
          ],
        });
      } else if (courseTypeFilter === "premiumCourses") {
        filterQuery.$and.push({
          $or: [
            { courseType: "premium" },
            { courseType: "subscriptionCourse", subscriptionType: "premium" },
          ],
        });
      } else if (courseTypeFilter === "subscriptionCourses") {
        filterQuery.$and.push({ courseType: "subscriptionCourse" });
      }
      // else you can add more courseTypeFilter options here if needed
    }

    // Remove $and if empty
    if (!filterQuery.$and.length) {
      delete filterQuery.$and;
    }

    // Find user and their subscribed courses
    const user = await User.findOne({
      _id: userId,
      ...(!isSuperAdmin
        ? { organization: new mongoose.Types.ObjectId(organization) }
        : {}),
    }).select("coursesSubscribed");

    if (!user) {
      ReqLogger(req, "error", "User does not exist");
      return res.status(404).json({
        message: "User does not exist",
        success: false,
      });
    }

    // Build query to get only subscribed courses with filters
    const baseQuery = {
      _id: { $in: user.coursesSubscribed },
      ...filterQuery,
    };

    // Fetch courses with pagination and modules/lectures populate
    const [courses, totalCount] = await Promise.all([
      Course.find(baseQuery)
        .populate({
          path: "modules",
          match: { status: "published" },
          options: { sort: { order: 1 } },
          populate: {
            path: "lectures",
            match: { status: "published" },
            options: { sort: { order: 1 } },
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * Number(limit))
        .limit(Number(limit))
        .exec(),
      Course.countDocuments(baseQuery),
    ]);

    if (!courses?.length) {
      ReqLogger(req, "error", "No subscribed courses found");
      return res.status(404).json({
        success: false,
        message: "No subscribed courses found",
        data: [],
      });
    }

    // Get purchased courses for isPurchased flag
    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      user: mongoose.Types.ObjectId(userId),
      course: { $in: courseIds },
    }).select("course");

    const purchasedCourseIds = new Set(
      purchases.map((purchase) => purchase.course.toString())
    );

    // Prepare response courses with courseType included
    // simplifiedCourses map को REPLACE करो:
    const simplifiedCourses = await Promise.all(
      courses.map(async (c) => {
        // ✅ FIXED: Total lectures count populated modules se
        const totalLecturesCount = c.modules.reduce((total, module) => {
          return total + (module.lectures ? module.lectures.length : 0);
        }, 0);

        return {
          _id: c._id,
          courseId: c.courseId,
          courseType: c.courseType,
          courseName: c.courseName,
          description: c.description,
          courseCategory: c.courseCategory,
          // ✅ NEW FIELDS
          lectures: c.lectures || [],
          totalLecturesCount,
          courseLecturesCount: totalLecturesCount,
          modules: c.modules,
          courseImage: c.courseImage
            ? await getSignedUrlFile(c.courseImage)
            : null,
          createdAt: c.createdAt,
          coursePrice: c.coursePrice,
          isPublished: c.isPublished,
          isPurchased: true,
        };
      })
    );

    ReqLogger(
      req,
      "info",
      "Success! Your subscribed courses have been retrieved successfully."
    );
    return res.status(200).json({
      status: "success",
      message:
        "Success! Your subscribed courses have been retrieved successfully.",
      data: simplifiedCourses,
      meta: {
        currentPage: Number(page),
        perPage: Number(limit),
        total: totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.markAsDone = async (req, res, next) => {
  try {
    const { lectureIndex, id } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const purchasedCourse = await Purchase.findOneAndUpdate(
      {
        _id: id,
        ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      },
      {
        $set: {
          [`course.lectures.${lectureIndex}.status`]: "completed",
        },
      },
      { new: true }
    ).exec();

    if (!purchasedCourse) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }
    ReqLogger(
      req,
      "info",
      "Success! The progress status of your lecture has been updated successfully."
    );
    return res.status(200).json({
      status: "success",
      message:
        "Success! The progress status of your lecture has been updated successfully.",
      data: purchasedCourse,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateCourseProgress = async (req, res) => {
  const { purchaseId, courseProgress } = req.body;
  const organization = req?.user?.organization;
  const isSuperAdmin = isSuperAdminUser(req?.user);

  try {
    const purchase = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    purchase.courseProgress = courseProgress;

    await purchase.save();

    ReqLogger(
      req,
      "info",
      "Success! The progress status of your lecture has been updated successfully."
    );

    return res.status(200).json({
      message:
        "Success! The progress status of your lecture has been updated successfully.",
    });
  } catch (error) {
    console.error("Error updating course progress:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.changePrivacyStatus = async (req, res, next) => {
  try {
    const { courseId, status } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    course.coursePrivacy = status;
    await course.save();

    ReqLogger(req, "info", "Success! Your privacy settings have been updated.");
    return res.status(200).json({
      status: "success",
      message: "Success! Your privacy settings have been updated.",
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

exports.coursePublishStatus = async (req, res, next) => {
  try {
    const { courseId, status } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(404).json({
        message:
          "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again.",
        success: false,
      });
    }

    console.log(course);
    course.isPublished = status;
    await course.save();

    ReqLogger(
      req,
      "info",
      "Success! Your publishing settings have been updated."
    );
    return res.status(200).json({
      status: "success",
      message: "Success! Your publishing settings have been updated.",
      data: course,
    });
  } catch (error) {
    next(error);
  }
};

exports.requestForCourse = async (req, res, next) => {
  try {
    const data = req.body;
    console.log(data);
    emailProvider.sendRequestForCourse(data, req?.user);
    ReqLogger(
      req,
      "info",
      "Success! Your request for the course has been submitted. We will notify you once it has been processed."
    );
    return res.status(200).json({
      status: "success",
      message:
        "Success! Your request for the course has been submitted. We will notify you once it has been processed.",
      // data: purchasedCourse,
    });
  } catch (error) {
    next(error);
  }
};

exports.generateAILecture = async (req, res, next) => {
  try {
    const { lectureDescription } = req.body;
    console.log(lectureDescription);

    const response = await invoke("ai-course-generation", {
      lectureDescription: lectureDescription,
    });

    console.log("description-------->", response);

    const { title, description } = response;
    ReqLogger(
      req,
      "info",
      `AI Generated Lecture completed title: ${title} description: ${description}`
    );
    return res.status(200).json({
      status: "success",
      message: "Success! The lecture has been generated ",
      title: title,
      description: description,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

const makeToken = (email) => {
  const config = getConfig();
  const expirationDate = new Date();
  expirationDate.setHours(new Date().getHours() + 72);
  return jwt.sign(
    { email: stripHtml(email), expirationDate },
    config.jwtSecret
  );
};

exports.shareCourse = async (req, res, next) => {
  try {
    const userData = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { emails, courseId } = userData;

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "No course have been created or uploaded yet. Please add some course for the users."
      );
      return res.status(404).json({
        message:
          "No course have been created or uploaded yet. Please add some course for the users.",
        success: false,
      });
    }

    const notFoundEmails = [];
    const sentEmails = [];

    for (const email of emails) {
      console.log(email.value);
      const existingUser = await User.findOne({
        email: email.value,
        ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      }).exec();
      console.log(existingUser);
      if (!existingUser) {
        notFoundEmails.push(email);
        continue;
      }
      const token = makeToken(email.value);
      const tokenRecord = new Token({
        token,
        email: email.value,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 72 * 60 * 60 * 1000),
        organization: existingUser?.organization,
      });
      await tokenRecord.save();
      emailProvider.sendCourseInvite(existingUser, stripHtml(token), course);

      const body = {
        course: course?._id,
        user: existingUser._id,
        invitedBy: req.user._id,
        organization: course?.organization,
      };

      const existingInvite = await Invite.findOne(body);

      if (!existingInvite) {
        const invitedUser = await Invite.create(body);
        console.log("invitedUser---------------->", invitedUser);
      }
      sentEmails.push(email);
    }

    if (notFoundEmails.length > 0) {
      ReqLogger(
        req,
        "error",
        `Users with the following emails are not registered:${notFoundEmails.join(
          ", "
        )}`
      );
      return res.status(400).json({
        message: `Users with the given emails are not registered so can't send invite. Kindly review your CSV file.`,
        success: false,
      });
    }

    ReqLogger(
      req,
      "info",
      "Invitation links for the quiz have been successfully sent!"
    );
    return res.status(200).json({
      status: "success",
      message: `Invitation links for the quiz have been successfully sent!`,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCourseStat = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    // Total Spent on Courses
    const totalSpent = await Purchase.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          hasPurchased: true,
          // ...(!isSuperAdmin
          //   ? { organization: new ObjectId(organization) }
          //   : {}),
        },
      },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const totalSpentAmount = totalSpent.length ? totalSpent[0].totalAmount : 0;

    // Enrolled Courses
    const enrolledCourses = await Purchase.countDocuments({
      user: mongoose.Types.ObjectId(userId),
      hasPurchased: true,
    });

    const inProgressCourses = await Purchase.countDocuments({
      user: mongoose.Types.ObjectId(userId),
      hasPurchased: true,
      $or: [
        {
          lectures: {
            $elemMatch: { progress: { $lt: 100 } },
          },
        },
        {
          lectures: { $size: 0 },
        },
      ],
    });

    // Completed Courses
    const completedCourses = await Purchase.countDocuments({
      user: mongoose.Types.ObjectId(userId),
      $and: [
        {
          "lectures.0": { $exists: true }, // At least one lecture exists
        },
        {
          lectures: {
            $not: {
              $elemMatch: { progress: { $lt: 100 } },
            },
          },
        },
      ],
    });

    const certificatesEarned = await certificateModel.countDocuments({
      user: mongoose.Types.ObjectId(userId),
    });

    // Return all stats
    return res.status(200).json({
      totalSpent: totalSpentAmount,
      enrolledCourses,
      inProgressCourses,
      completedCourses,
      certificatesEarned,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourseStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req?.user?.organization;
    const config = getConfig();
    const existingOrganization = await Organization.findOne({
      _id: new ObjectId(organization),
    }).exec();

    if (
      existingOrganization?.stripeAccountStatus !== "active" &&
      organization.toString() !== config.prescientOrgId
    ) {
      ReqLogger(
        req,
        "error",
        "To publish your course and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution."
      );
      return res.status(404).json({
        message:
          "To publish your course and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution.",
        success: false,
      });
    }
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { status } = req.body;
    const { courseId } = req.params;

    await courseStatusSchema.validateAsync({ status });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    course.status = status;
    course.isPublished = status === "draft" ? false : true;
    await course.save();

    ReqLogger(req, "info", "Course updated successfully");
    return res.json({ message: "Course updated successfully", status });
  } catch (error) {
    return next(error);
  }
};

exports.updateCoursePrivacy = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { coursePrivacy } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { courseId } = req.params;

    await coursePrivacySchema.validateAsync({ coursePrivacy });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!course) {
      ReqLogger(
        req,
        "error",
        "Course Not Found: The specified course could not be located. Please verify the course ID or name and try again."
      );
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    course.coursePrivacy = coursePrivacy;
    await course.save();

    ReqLogger(req, "info", "Course updated successfully");
    return res.json({ message: "Course updated successfully", coursePrivacy });
  } catch (error) {
    return next(error);
  }
};
