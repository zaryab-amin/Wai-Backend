const httpStatus = require("http-status");
const RequestCourse = require("../models/requestCourse.model");
const APIError = require("../errors/api-error");
const emailProvider = require("../services/emails/emailProvider");
const { ReqLogger } = require("../utils/Logger");
const { isSuperAdminUser } = require("../utils");

// Create a new RequestCourse
exports.createRequestCourse = async (req, res, next) => {
  try {
    const data = req.body;
    const user = req.user;
    const organizationId = req.user.organization;
    const requestedBy = new ObjectId(req.user._id);
    const body = {
      ...data,
      requestedBy,
      user,
      organization: new ObjectId(organizationId),
    };
    console.log("body------------->", body);
    const requestCourse = new RequestCourse(body);
    const savedRequestCourse = await requestCourse.save();
    emailProvider.sendRequestForCourse(body, req?.user);
    ReqLogger(
      req,
      "info",
      "Success! Your request for the course has been submitted. We will notify you once it has been processed."
    );
    return res.status(200).json({
      status: "success",
      message:
        "Success! Your request for the course has been submitted. We will notify you once it has been processed.",
      data: savedRequestCourse,
    });
  } catch (error) {
    next(error);
  }
};

// Get a RequestCourse by ID
exports.getRequestCourseById = async (req, res, next) => {
  try {
    const requestCourse = await RequestCourse.get(req.params.requestCourseId);
    res.json(requestCourse.transform());
  } catch (error) {
    next(error);
  }
};

// Update a RequestCourse by ID
exports.updateRequestCourseById = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const requestCourse = await RequestCourse.findOne({
      _id: req.params.requestCourseId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!requestCourse) {
      throw new APIError({
        message: "RequestCourse not found",
        status: httpStatus.NOT_FOUND,
      });
    }

    const updatedRequestCourse = Object.assign(requestCourse, req.body);
    const savedRequestCourse = await updatedRequestCourse.save();
    res.json(savedRequestCourse.transform());
  } catch (error) {
    next(error);
  }
};

// Delete a RequestCourse by ID
exports.deleteRequestCourseById = async (req, res, next) => {
  try {
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;
    const requestCourse = await RequestCourse.findOne({
      _id: new ObjectId(req.params.requestCourseId),
      organization: organizationId ? new ObjectId(organizationId) : undefined,
    }).exec();
    if (!requestCourse) {
      throw new APIError({
        message: "RequestCourse not found",
        status: httpStatus.NOT_FOUND,
      });
    }

    requestCourse.isDeleted = true;
    requestCourse.deletedAt = Date.now();
    const savedRequestCourse = await requestCourse.save();
    res.json(savedRequestCourse.transform());
  } catch (error) {
    next(error);
  }
};

// List all RequestCourses
exports.listRequestCourses = async (req, res, next) => {
  try {
    const { page, limit, search = "" } = req.query;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;
    let query = {
      organization: organizationId ? new ObjectId(organizationId) : undefined,
    };
    if (search) {
      query = {
        courseTitle: { $regex: "^" + search, $options: "i" },
      };
    }
    const courses = await RequestCourse.find(query)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    const totalCount = await RequestCourse.countDocuments(query);
    res.json({ data: courses, totalCount });
  } catch (error) {
    next(error);
  }
};
