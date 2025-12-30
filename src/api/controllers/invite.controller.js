const Invite = require("../models/invite.model");
const Quiz = require("../models/quiz.model");
const { ObjectId } = require("mongodb");
const { ReqLogger } = require("../utils/Logger");
const { getSignedUrlFile } = require("./gcs.controller");
const { queryBuilder } = require("../utils/queryBuilder");

exports.getInvitedUsersForQuiz = async (req, res, next) => {
  try {
    const { page, limit, search = "" } = req.query;
    const { quizId } = req.params;
    const organization = req?.user?.organization;
    const invitedUsers = await Invite.find({
      quiz: new ObjectId(quizId),
      invitedBy: req.user._id,
      organization,
    })
      .populate("user invitedBy")
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    ReqLogger(req, "info", "Invited Users has been retrieved");
    return res.status(201).json({
      status: "success",
      message: "Invited Users has been retrieved.",
      data: invitedUsers,
    });
  } catch (error) {
    console.error("Error getting invited users:", error);
    return next(error);
  }
};

exports.getInvitedQuizForUser = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const invitedUsers = await Invite.find({
      user: req.user._id,
      isSubmitted: false,
      organization,
    }).populate("user invitedBy");

    const quizIds = invitedUsers.map((invitedUser) => invitedUser.quiz);
    console.log("quiz ids-------->", quizIds);

    const quizzes = await Quiz.find({
      _id: { $in: quizIds },
      organization,
      isPublished: true,
    })
      .populate("questions", "question_number question options questionType")
      .exec();

    if (!quizzes?.length) {
      return res.status(201).json({
        status: "success",
        message: "Invited Quizzes have been retrieved.",
        data: [],
      });
    }

    const populatedInvitedUsers = invitedUsers.map((invitedUser) => {
      const quiz = quizzes.find(
        (quiz) => String(quiz._id) === String(invitedUser.quiz)
      );
      return {
        invitedBy: invitedUser?.toObject(),
        ...quiz?.toObject(),
      };
    });

    ReqLogger(req, "info", "Invited Quizzes have been retrieved");
    return res.status(201).json({
      status: "success",
      message: "Invited Quizzes have been retrieved.",
      data: populatedInvitedUsers,
    });
  } catch (error) {
    console.error("Error getting invited quizzes:", error);
    return next(error);
  }
};

/**
 * Get all course invites for a specific user
 * @public
 */
exports.getCourseInvitesForUser = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      courseType,
      search,
      category,
      difficultyLevel,
      minAmount,
      maxAmount,
    } = req.query;
    const organization = req?.user?.organization;

    const filterQuery = queryBuilder([
      { type: "search", field: "course.courseName", value: search },
      { type: "field", field: "course.courseType", value: courseType },
      {
        type: "in",
        field: "course.difficultyLevel",
        value: difficultyLevel?.toString()?.split(","),
      },
      {
        type: "in",
        field: "course.courseCategory",
        value: category?.toString()?.split(","),
      },
      { type: "gte", field: "course.coursePrice", value: Number(minAmount) },
      { type: "lte", field: "course.coursePrice", value: Number(maxAmount) },
    ]);

    const invitedUsers = await Invite.find({
      user: req.user._id,
      course: { $ne: null },
      organization,
      ...filterQuery,
    })
      .populate("user invitedBy course")
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const totalCount = await Invite.countDocuments({
      user: req.user._id,
      course: { $ne: null },
      organization,
      ...filterQuery,
    });

    const invitedCourses = [];
    for (const invite of invitedUsers) {
      if (invite.course && invite.course.courseImage) {
        invite.course.courseImage = await getSignedUrlFile(
          invite.course.courseImage
        );
        // invite.course.lectures = invite.course.lectures;
        invitedCourses.push(invite.course);
      }
    }

    console.log("invites------------>", invitedCourses);

    return res.status(200).json({
      status: "success",
      message: "invited courses retrieved successfully.",
      data: invitedCourses,
      meta: {
        currentPage: page,
        perPage: limit,
        total: totalCount,
      },
    });
  } catch (error) {
    console.log("Error getting course invites:", error);
    next(error);
  }
};
