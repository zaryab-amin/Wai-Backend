const Certificate = require("../models/certificate.model");
const Course = require("../models/course.model");
const Purchase = require("../models/purchase.model");
const User = require("../models/user.model");
const { v4: uuidv4 } = require("uuid");
const emailProvider = require("../services/emails/emailProvider");
const { ReqLogger } = require("../utils/Logger");
const { getSignedUrlFile } = require("./gcs.controller");
const { stripHtml } = require("../utils/sanitize");
const { ObjectId } = require("mongodb");
const { isSuperAdminUser } = require("../utils");
const APIError = require("../errors/api-error");

exports.createCertficate = async (req, res, next) => {
  try {
    console.log("💥 Certificate API hit");

    const organization = req?.user?.organization;
    console.log("🧑‍💼 Requesting user ID:", req.user?._id);
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const uuid = uuidv4({ format: "hex" });
    const certificateId = uuid.substring(0, 8);

    const data = req.body;
    console.log("📦 Incoming payload:", data);

    const { courseId, email, userId } = data;

    let user = null;
    if (email) {
      user = await User.findOne({ email }).exec();
      console.log("📧 Found user by email:", user?._id);
    } else if (userId) {
      user = await User.findById(userId).exec();
      console.log("🆔 Found user by ID:", user?._id);
    } else {
      user = req.user;
      console.log("🙋 Default to logged-in user:", user?._id);
    }

    if (!user) {
      console.log("❌ User not found!");
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ FIXED: Populate course to get lectures array
    const purchase = await Purchase.findOne({
      course: new ObjectId(courseId),
      user: new ObjectId(user._id),
    })
      .populate("course", "lectures") // 👈 REQUIRED to calculate total lectures
      .exec();

    if (!purchase) {
      console.log(
        "❌ Purchase not found for user:",
        user._id,
        " and course:",
        courseId
      );
      return res.status(404).json({ error: "Purchase not found" });
    }

    console.log("🛒 Purchase found:", purchase._id);
    console.log("📚 Purchase.lectures =", purchase.lectures);

    // ✅ Calculate progress from populated data
    const completedLectures =
      purchase.lectures?.filter((l) => l.progress === 100).length || 0;
    const totalLectures = purchase.course?.lectures?.length || 0;
    const calculatedProgress =
      totalLectures > 0
        ? Math.round((completedLectures / totalLectures) * 100)
        : 0;

    console.log("📊 Calculated course progress:", calculatedProgress);

    if (calculatedProgress < 100) {
      return res.status(400).json({
        error: "Cannot create certificate - course not fully completed",
        currentProgress: calculatedProgress,
      });
    }

    const existingCourse = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin
        ? {
            $or: [
              { organization: new ObjectId(organization) },
              { coursePrivacy: "public" },
            ],
          }
        : {}),
    }).exec();

    if (!existingCourse) {
      console.log("❌ Course not found or not authorized");
      return res.status(404).json({ error: "Course not found" });
    }

    const { courseName, certificateDescription } = existingCourse;
    const body = {
      course: new ObjectId(courseId),
      user: user._id,
    };

    const existingCertificate = await Certificate.findOne(body).exec();
    console.log("🎓 Existing certificate:", existingCertificate?._id);

    const certificateUser = await User.findById(user._id);
    console.log("📩 Sending certificate to user:", certificateUser?.email);

    if (!existingCertificate) {
      const finalData = {
        ...body,
        certificateTitle: courseName,
        certificateDescription,
        certificateId,
        organization: existingCourse?.organization,
      };

      const certificate = await new Certificate(finalData).save();
      console.log("✅ New certificate created:", certificate._id);

      emailProvider.sendCourseCompletion(
        stripHtml(courseName),
        certificateUser
      );

      ReqLogger(
        req,
        "info",
        "Congratulations! Your certificate has been successfully created and is ready for download."
      );

      return res.status(201).json({
        status: "success",
        message:
          "Congratulations! Your certificate has been successfully created and is ready for download.",
        data: certificate,
      });
    } else {
      console.log("📎 Re-using existing certificate:", existingCertificate._id);

      emailProvider.sendCourseCompletion(
        stripHtml(courseName),
        certificateUser
      );

      ReqLogger(
        req,
        "info",
        "Congratulations! Your certificate has been successfully created and is ready for download."
      );

      return res.status(201).json({
        status: "success",
        message:
          "Congratulations! Your certificate has been successfully created and is ready for download.",
        data: existingCertificate,
      });
    }
  } catch (error) {
    console.error("❗ Internal Server Error in createCertificate:", error);
    return next(error);
  }
};

exports.getCertificate = async (req, res, next) => {
  try {
    // const organization = req?.user?.organization;
    // const isSuperAdmin = isSuperAdminUser(req?.user);

    const certificateId = req.params.certificateId;
    const certifcate = await Certificate.findOne({
      _id: new ObjectId(certificateId),
      $or: [
        { _id: new ObjectId(certificateId) },
        { certificateId: certificateId },
      ],
      // ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("user course")
      .exec();
    if (!certifcate) {
      return res.status(404).json({
        message: "certifcate does not exists",
        success: false,
      });
    }
    ReqLogger(
      req,
      "info",
      "Great news! Your certificate has been successfully retrieved and is available for download."
    );
    return res.status(201).json({
      status: "success",
      message:
        "Great news! Your certificate has been successfully retrieved and is available for download .",
      data: certifcate,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCertificateByUser = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const user = req.user._id;
    const certificate = await Certificate.find({
      user,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("course user", "lectures")
      .exec();
    if (!certificate) {
      return res.status(404).json({
        message: "certifcate does not exists",
        success: false,
      });
    }
    const simplifiedCertificates = [];

    for await (const c of certificate) {
      if (c.course.courseImage) {
        c.course.courseImage = await getSignedUrlFile(c.course.courseImage);
      }

      simplifiedCertificates.push({
        _id: c._id,
        courseId: c.course.courseId,
        courseName: c.course.courseName,
        courseImage: c.course.courseImage,
        certificateId: c.certificateId,
        user: c.user,
        createdAt: c.createdAt,
      });
    }
    ReqLogger(
      req,
      "info",
      "Great news! Your certificate has been successfully retrieved and is available for download."
    );
    return res.status(201).json({
      status: "success",
      message:
        "Great news! Your certificate has been successfully retrieved and is available for download .",
      data: simplifiedCertificates,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCertificateDataByUser = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { search } = req.query;

    console.log("search--------->", search);

    // Create the base query
    let query = {
      user: userId,
    };

    let searchConditions = [];
    if (search) {
      searchConditions = [
        {
          $lookup: {
            from: "courses",
            localField: "course",
            foreignField: "_id",
            as: "courseData",
          },
        },
        {
          $lookup: {
            from: "quizzes",
            localField: "quiz",
            foreignField: "_id",
            as: "quizData",
          },
        },
        {
          $match: {
            $or: [
              { "courseData.courseName": { $regex: search, $options: "i" } },
              { "quizData.name": { $regex: search, $options: "i" } },
            ],
          },
        },
      ];
    }

    const certificates = await Certificate.aggregate([
      { $match: query },
      ...(search ? searchConditions : []),
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseData",
        },
      },
      {
        $lookup: {
          from: "quizzes",
          localField: "quiz",
          foreignField: "_id",
          as: "quizData",
        },
      },
      {
        $unwind: {
          path: "$courseData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$quizData",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Sort by creation date
      { $sort: { createdAt: -1 } },
    ]);

    if (!certificates || certificates.length === 0) {
      return res.status(200).json({
        message: "No certificates found for this user",
        success: false,
        data: [],
      });
    }

    const certificateData = certificates.map((certificate) => {
      const course = certificate.courseData;
      const quiz = certificate.quizData;

      return {
        _id: certificate._id,
        icon: course?.courseImage || quiz?.quizImage,
        title: course?.courseName || quiz?.name,
        level: course?.difficultyLevel || "",
        lectures: course
          ? `${course.lectures?.length || 0}/${
              course.lectures?.length || 0
            } lectures`
          : "",
        questions: quiz
          ? `${quiz.questions?.length || 0}/${
              quiz.questions?.length || 0
            } questions`
          : "",
        category: course ? "Course" : quiz ? "Quiz" : "",
        duration: "20 min 12 sec",
        issueDate: new Date(certificate.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        price:
          course?.coursePrice > 0
            ? `$${course.coursePrice}`
            : quiz?.quizPrice > 0
            ? quiz?.quizPrice
            : "Free",
      };
    });

    return res.status(200).json({
      message: "Certificates fetched successfully",
      data: certificateData,
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    next(new APIError({ message: "Error fetching certificates", status: 500 }));
  }
};
