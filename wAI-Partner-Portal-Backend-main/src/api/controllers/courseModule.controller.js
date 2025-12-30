const { v4: uuidv4 } = require("uuid");
const { ReqLogger } = require("../utils/Logger");
const CourseModule = require("../models/courseModule.model");
const { addCourseModuleSchema } = require("../validations/courseModule.validation");
const Course = require("../models/course.model");
// const { sanitizeTemplate } = require("../utils/sanitize");
const { courseStatusSchema } = require("../validations/course.validation");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const CourseLecture = require("../models/courseLecture.model");
const LectureVideo = require("../models/lectureVideo.model");
const { isSuperAdminUser } = require("../utils");

exports.addCourseModule = async (req, res, next) => {
  try {
    const {
      moduleTitle,
      courseId,
      // description,
      order,
      creditHours,
    } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const userId = req.user?._id;

    await addCourseModuleSchema.validateAsync({
      moduleTitle,
      creditHours,
      // description,
      order,
    })

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    const moduleId = uuidv4({ format: "hex" });
    // const sanitizedDescription = sanitizeTemplate(description);

    const createModulePayload = {
      moduleTitle,
      course: new ObjectId(courseId),
      creditHours,
      // description: sanitizedDescription,
      status: 'published',
      order,
      moduleId,
      organization: course?.organization
    }

    const courseModule = await CourseModule.create(createModulePayload);

    await Course.updateOne(
      { _id: new ObjectId(courseId), organization: course?.organization },
      { $push: { modules: courseModule._id } }
    );

    ReqLogger(req, "info", "Course module created successfully");
    return res.json({ message: "Module created successfully", courseModule });
  } catch (error) {
    return next(error);
  }
};

exports.updateOrder = async (req, res, next) => {
  try {
    const { courseId, modules } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user?._id;

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid course" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    // Update module order in the database
    const updatePromises = modules.map(async (module) => {
      await CourseModule.updateOne(
        { _id: new ObjectId(module.id), course: new ObjectId(courseId) },
        { $set: { order: module.order } }
      );
    });

    await Promise.all(updatePromises);

    ReqLogger(req, "info", "Module order updated successfully");
    return res.json({ success: true, message: "Module order updated successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.cloneCourseModule = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const { moduleId } = req.body;
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
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule
      .findOne({
        _id: new ObjectId(moduleId),
        course: course?._id,
        organization: course?.organization
      })
      .populate({
        path: 'lectures',
        populate: [
          { path: 'videoSrc' },
          { path: 'quiz' },
        ],
      })
      .exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const clonedModuleData = {
      _id: new mongoose.Types.ObjectId(),
      moduleId: uuidv4({ format: "hex" }),
      order: (courseModule?.lectures?.length || 0) + 1,
      moduleTitle: `Clone: ${courseModule.moduleTitle}`,
      course: courseModule.course,
      status: courseModule.status,
      description: courseModule.description,
      lectures: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: course?.organization,
    };

    const populatedClonedData = JSON.parse(JSON.stringify(clonedModuleData))

    for await (const lecture of courseModule.lectures) {
      let clonedVideoSrc = null;

      const clonedLectureId = new mongoose.Types.ObjectId();

      if (lecture.videoSrc) {
        clonedVideoSrc = new LectureVideo({
          ...lecture.videoSrc.toObject(),
          lecture: clonedLectureId,
          createdAt: new Date(),
          organization: course?.organization,
          updatedAt: new Date(),
          _id: new mongoose.Types.ObjectId(),
        });
        await clonedVideoSrc.save();
      }

      const clonedLectureData = {
        ...lecture.toObject(),
        _id: clonedLectureId,
        lectureId: uuidv4({ format: "hex" }),
        module: null,
        course: courseModule.course,
        videoSrc: clonedVideoSrc ? clonedVideoSrc._id : null,
        quiz: lecture?.quiz,
        organization: course?.organization,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const clonedLecture = new CourseLecture(clonedLectureData);
      await clonedLecture.save();
      clonedModuleData.lectures.push(clonedLecture._id);
      populatedClonedData?.lectures.push({ ...clonedLectureData, videoSrc: clonedVideoSrc })
    }

    const clonedModule = new CourseModule(clonedModuleData);
    await clonedModule.save();

    await Course.updateOne(
      { _id: new ObjectId(courseId), organization: course?.organization },
      { $push: { modules: clonedModule._id } }
    );

    ReqLogger(req, "info", "Course module cloned successfully");
    return res.json({ message: "Module cloned successfully", clonedModule: populatedClonedData });

  } catch (error) {
    return next(error);
  }
}

exports.updateCourseModule = async (req, res, next) => {
  try {
    const {
      moduleTitle,
      courseId,
      creditHours,
      // description,
      order,
    } = req.body;
    const { moduleId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user?._id;

    await addCourseModuleSchema.validateAsync({
      moduleTitle,
      creditHours,
      // description,
      order,
    })

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule.findOne({
      _id: new ObjectId(moduleId),
      organization: course?.organization,
    }).exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    // const sanitizedDescription = sanitizeTemplate(description);

    courseModule.moduleTitle = moduleTitle;
    courseModule.creditHours = creditHours;
    // courseModule.description = sanitizedDescription;
    courseModule.order = order;

    await courseModule.save();
    ReqLogger(req, "info", "Course module updated successfully");
    return res.json({ message: "Module updated successfully", courseModule });
  } catch (error) {
    return next(error);
  }
};

exports.deleteCourseModule = async (req, res, next) => {
  try {
    const { courseId, moduleId } = req.params;
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
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule.findOne({
      _id: new ObjectId(moduleId),
      organization: course?.organization,
    }).exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseModule?.course?.toString() !== courseId?.toString()) {
      return res.status(400).json({ message: "Invalid data" });
    }

    await Course.updateOne(
      { _id: new ObjectId(courseId), organization: course?.organization },
      { $pull: { modules: moduleId } } // Remove module ID from course
    );

    await CourseModule.deleteOne({ _id: new ObjectId(moduleId), organization: course?.organization }).exec();

    await CourseLecture.deleteMany({ module: new ObjectId(moduleId), organization: course?.organization })

    ReqLogger(req, "info", "Course module deleted successfully");
    return res.json({ message: "Module deleted successfully" });
  } catch (error) {
    return next(error);
  }
}

exports.updateCourseModuleStatus = async (req, res, next) => {
  try {
    const { courseId, moduleId } = req.params;
    const { status } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const userId = req.user?._id;

    await courseStatusSchema.validateAsync({ status })

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "You are not authorized to perform this action" });
    }

    const courseModule = await CourseModule.findOne({
      _id: new ObjectId(moduleId),
      organization: course?.organization
    }).exec();

    if (!courseModule) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (courseModule?.course?.toString() !== courseId?.toString()) {
      return res.status(400).json({ message: "Invalid data" });
    }

    courseModule.status = status;
    await courseModule?.save();

    ReqLogger(req, "info", "Course module updated successfully");
    return res.json({ message: "Module updated successfully", status });
  } catch (error) {
    return next(error);
  }
}
