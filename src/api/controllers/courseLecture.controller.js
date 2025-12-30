const { v4: uuidv4 } = require("uuid");
const { ReqLogger } = require("../utils/Logger");
const CourseLecture = require("../models/courseLecture.model");
const LectureVideo = require("../models/lectureVideo.model");
const {
  addCourseLectureSchema,
  updateCourseLectureSchema,
} = require("../validations/courseLecture.validation");
const { uploadFile, getSignedUrlFile, deleteFile } = require("./gcs.controller");
const Course = require("../models/course.model");
const CourseModule = require("../models/courseModule.model");
const { courseStatusSchema } = require("../validations/course.validation");
const { ObjectId } = require("mongodb");
const { sanitizeTemplate } = require("../utils/sanitize");
const { calculateLectureDuration } = require("../utils/timeUtils");
const { isSuperAdminUser } = require("../utils");

exports.addCourseLecture = async (req, res, next) => {
  try {
    const { title, order, lectureType, courseId, moduleId } = req.body;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    await addCourseLectureSchema.validateAsync({
      title,
      order,
    });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule.findOne({
      _id: new ObjectId(moduleId),
      organization: course?.organization,
    }).exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const lectureId = uuidv4({ format: "hex" });

    const createLecturePayload = {
      lectureId,
      title,
      order,
      lectureType: lectureType ?? "lecture",
      status: "published",
      course: new ObjectId(courseId),
      module: new ObjectId(moduleId),
      organization: course?.organization,
    };

    const courseLecture = await CourseLecture.create(createLecturePayload);

    await Course.updateOne(
      { _id: new ObjectId(courseId), organization: course?.organization },
      { $push: { lectures: courseLecture._id } }
    );

    await CourseModule.updateOne(
      { _id: new ObjectId(moduleId), organization: course?.organization },
      { $push: { lectures: courseLecture._id } }
    );

    ReqLogger(req, "info", "Course lecture created successfully");
    return res.json({
      message: "Lecture created successfully",
      lecture: courseLecture,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourseLecture = async (req, res, next) => {
  try {
    const { payload } = req.body;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { lectureId } = req.params;

    const lecturePayload = JSON.parse(payload);
    const {
      title,
      duration,
      lectureType,
      lectureContent,
      order,
      courseId,
      moduleId,
    } = lecturePayload;

    const files = req?.files;
    let fileUrl = "";
    let videoLecture = null;
    let lectureDuration = duration || 0;
    let document = null;

    await updateCourseLectureSchema.validateAsync({
      title,
      duration,
      order,
      lectureType,
      lectureContent,
    });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule.findOne({
      _id: new ObjectId(moduleId),
      organization: course?.organization,
    }).exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    let courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    })
      .populate("videoSrc");

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    // Handle video upload
    if (files?.file?.[0]) {
      const video = files.file[0];
      const { url: signedUrl, key } = await uploadFile(video, "course-videos");


      videoLecture = await LectureVideo.create({
        fileName: video.originalname,
        url: key,
        status: "uploaded",
        lecture: new ObjectId(lectureId),
        organization: course?.organization,
      });
      courseLecture.videoSrc = videoLecture._id;
      fileUrl = signedUrl;
      lectureDuration = duration || 0;
    } else if (courseLecture.videoSrc?._id) {
      fileUrl = await getSignedUrlFile(courseLecture.videoSrc.url); // url = key
    }

    // Handle document upload
    const allowedDocumentExtensions = ["pdf", "doc", "docx"];
    if (files?.document?.[0]) {
      const doc = files.document[0];
      const extension = doc.originalname?.split(".")?.pop()?.toLowerCase();
      if (!allowedDocumentExtensions.includes(extension)) {
        return res.status(400).json({
          error: "Only PDF, DOC, and DOCX files are allowed for documents.",
        });
      }
      const { url, key } = await uploadFile(doc, "course-documents");
      document = {
        key,
        url,
        name: doc.originalname,
        type: doc.mimetype,
      };
    } else {
      document = courseLecture.document;
    }

    const sanitizedLectureContent = sanitizeTemplate(lectureContent);
    if (lectureType === "textLecture" && sanitizedLectureContent?.length) {
      lectureDuration = calculateLectureDuration(sanitizedLectureContent);
    }

    // Update lecture
    courseLecture.title = title;
    courseLecture.lectureType = lectureType;
    courseLecture.order = order;
    courseLecture.duration = lectureDuration;
    courseLecture.lectureContent = sanitizedLectureContent;
    if (document) courseLecture.document = document;

    await courseLecture.save();
    await courseLecture.populate("videoSrc");

    ReqLogger(req, "info", "Course lecture updated successfully");
    return res.json({
      message: "Lecture updated successfully",
      lecture: courseLecture,
      videoLecture,
      document,
      fileUrl,
    });
  } catch (error) {
    ReqLogger(req, "error", `Error updating lecture: ${error.message}`);
    return next(error);
  }
};

exports.deleteLectureDocument = async (req, res, next) => {
  try {
    const { courseId, lectureId, documentId } = req.params;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    }).exec();

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseLecture.course.toString() !== courseId) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseLecture.document?.key !== documentId) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete document from GCS
    await deleteFile(documentId);

    // Clear document field
    courseLecture.document = null;
    await courseLecture.save();

    ReqLogger(req, "info", "Lecture document deleted successfully");
    return res.json({ message: "Lecture document deleted successfully" });
  } catch (error) {
    ReqLogger(req, "error", `Error deleting lecture document: ${error.message}`);
    return next(error);
  }
};

exports.updateOrder = async (req, res, next) => {
  try {
    const { courseId, lectures } = req.body;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid course" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    // Update lecture order in the database
    const updatePromises = lectures.map(async (lecture) => {
      await CourseLecture.updateOne(
        { _id: new ObjectId(lecture.id), course: new ObjectId(courseId) },
        { $set: { order: lecture.order, module: new ObjectId(lecture.moduleId) } }
      );
    });

    await Promise.all(updatePromises);

    ReqLogger(req, "info", "Lecture order updated successfully");
    return res.json({ success: true, message: "Lecture order updated successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.deleteCourseLecture = async (req, res, next) => {
  try {
    const { lectureId, courseId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user?._id;

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    }).exec();

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseLecture?.course?.toString() !== courseId?.toString()) {
      return res.status(400).json({ message: "Invalid data" });
    }

    await CourseLecture.deleteOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    });

    await Course.updateOne(
      { _id: new ObjectId(courseId), organization: course?.organization },
      { $pull: { lectures: new ObjectId(lectureId) } }
    );

    await CourseModule.updateOne(
      {
        _id: new ObjectId(courseLecture?.module),
        organization: course?.organization,
      },
      { $pull: { lectures: new ObjectId(lectureId) } }
    );

    ReqLogger(req, "info", "Course lecture deleted successfully");
    return res.json({ message: "Lecture deleted successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.deleteCourseLectureVideo = async (req, res, next) => {
  try {
    const { lectureId, courseId, videoId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user?._id;

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    }).exec();

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseLecture?.course?.toString() !== courseId?.toString()) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const lectureVideo = await LectureVideo.findOne({
      _id: new ObjectId(videoId),
      organization: course?.organization,
    }).exec();

    if (!lectureVideo) {
      return res.status(400).json({ message: "Invalid data" });
    }

    await LectureVideo.deleteOne({
      _id: new ObjectId(videoId),
      organization: course?.organization,
    });
    courseLecture.videoSrc = null;
    await courseLecture?.save();

    ReqLogger(req, "info", "Course lecture deleted successfully");
    return res.json({ message: "Lecture deleted successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourseLectureStatus = async (req, res, next) => {
  try {
    const { lectureId, courseId } = req.params;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { status } = req.body;

    await courseStatusSchema.validateAsync({ status });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      organization: course?.organization,
    }).exec();

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseLecture?.course?.toString() !== courseId?.toString()) {
      return res.status(400).json({ message: "Invalid data" });
    }

    courseLecture.status = status;
    await courseLecture.save();

    ReqLogger(req, "info", "Course lecture updated successfully");
    return res.json({ message: "Lecture updated successfully", status });
  } catch (error) {
    return next(error);
  }
};
