const CourseTemplate = require("../models/courseTemplate.model");
const { ReqLogger } = require("../utils/Logger");

exports.getTemplate = async (req, res, next) => {
  try {
    const templateId = req.params.templateId;
    const template = await CourseTemplate.findOne({
      templateCourseId: templateId,
    }).exec();
    if (!template) {
      ReqLogger(req, "error", "The specified template does not exist.");
      return res.status(404).json({
        message: "The specified template does not exist.",
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
    ReqLogger(req, "info", "Template successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Template successfully retrieved.",
      data: template,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getTemplateByUser = async (req, res, next) => {
  try {
    const template = await CourseTemplate.find({
      created_by: req.user._id,
    }).exec();
    if (!template) {
      ReqLogger(req, "error", "There is no template available for this user.");
      return res.status(404).json({
        message: "There is no template available for this user.",
        success: false,
      });
    }

    // console.log("templates ------------->", template);
    const simplifiedCourse = template.map((c) => {
      return {
        templateCourseId: c.templateCourseId,
        courseType: c.courseType,
        courseName: c.courseName,
        description: c.description,
        lectures: c.lectures.length,
        courseImage: c.courseImage,
        createdAt: c.createdAt,
        coursePrice: c.coursePrice,
      };
    });
    console.log("templates ------------->", simplifiedCourse);
    ReqLogger(req, "info", "Template successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Template successfully retrieved.",
      data: simplifiedCourse,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteTemplate = async (req, res, next) => {
  try {
    const templateId = req.params.templateId;
    const template = await CourseTemplate.findOne({
      templateCourseId: templateId,
    }).exec();
    if (!template) {
      ReqLogger(req, "error", "No template available for deletion.");
      return res.status(404).json({
        message: "No template available for deletion.",
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
    await CourseTemplate.deleteOne({ templateCourseId: templateId });
    ReqLogger(req, "info", "Template successfully deleted.");
    return res.status(200).json({
      status: "success",
      message: "Template successfully deleted.",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
};
