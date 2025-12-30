const Template = require("../models/template.model");
const { ReqLogger } = require("../utils/Logger");

exports.createTemplate = async (req, res, next) => {
  try {
    const created_by = req.user._id;
    const data = req.body;
    const { name } = data;
    const existingTemplate = await Template.findOne({ name }).exec();
    if (existingTemplate) {
      ReqLogger(req, "error", "A template with this name already exists.");
      return res.status(400).json({
        message: "A template with this name already exists.",
        success: false,
      });
    }
    const finalData = { ...data, created_by };
    const template = await new Template(finalData).save();
    const templateTransform = template.transform();
    ReqLogger(req, "info", "Template successfully created.");
    return res.status(201).json({
      status: "success",
      message: "Template successfully created.",
      data: templateTransform,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getTemplate = async (req, res, next) => {
  try {
    const templateId = req.params.templateId;
    const template = await Template.findOne({ templateId: templateId }).exec();
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
    const template = await Template.find({ created_by: req.user._id }).exec();
    if (!template) {
      ReqLogger(req, "error", "The specified template does not exist.");
      return res.status(404).json({
        message: "Template does not exists",
        success: false,
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

exports.updateTemplate = async (req, res, next) => {
  try {
    const { name, answers, questions } = req.body;
    const templateId = req.body.templateId;
    const template = await Template.findOne({ templateId: templateId }).exec();
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

    template.name = name;
    template.questions = questions;
    template.answers = answers;
    template.screenshotTime = screenshotTime;
    template.isTabSwiching = isTabSwiching;
    template.attemptsOfQuiz = attemptsOfQuiz;

    await template.save();

    ReqLogger(req, "info", "Template successfully updated.");
    return res.status(200).json({
      status: "success",
      message: "Template successfully updated.",
      data: template,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteTemplate = async (req, res, next) => {
  try {
    const templateId = req.params.templateId;
    console.log("template ID: " + templateId);
    const template = await Template.findOne({ templateId: templateId }).exec();
    console.log(template);
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
    await Template.deleteOne({ templateId: templateId });

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
