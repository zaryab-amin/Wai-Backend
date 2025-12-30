/* eslint-disable quotes */
const Quiz = require("../models/quiz.model");
const User = require("../models/user.model");
const Template = require("../models/template.model");
const { v4: uuidv4 } = require("uuid");
const emailProvider = require("../services/emails/emailProvider");
const jwt = require("jsonwebtoken");
const { ReqLogger } = require("../utils/Logger");
const Token = require("../models/token.model");
const Course = require("../models/course.model");
const Invite = require("../models/invite.model");
const { stripHtml, sanitizeTemplate } = require("../utils/sanitize");
const { ObjectId } = require("mongodb");
const {
  createQuizSchema,
  quizQuestionSchema,
  updateQuizSettingSchema,
  quizPrivacySchema,
} = require("../validations/quiz.validation");
const { uploadFile, getSignedUrlFile } = require("./gcs.controller");
const QuizQuestion = require("../models/quizQuestion.model");
const CourseLecture = require("../models/courseLecture.model");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const { queryBuilder } = require("../utils/queryBuilder");
const mongoose = require("mongoose");
const { isSuperAdminUser } = require("../utils");
const Organization = require("../models/organization.model");
const { getConfig } = require("../../config/vars");
const Report = require("../models/report.model");

const allowedExtensions = ["png", "jpg", "jpeg"];

exports.createQuiz = async (req, res, next) => {
  try {
    const quizId = uuidv4({ format: "hex" });
    const created_by = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { payload } = req.body;
    const file = req?.file;

    const quizPayload = JSON.parse(payload);

    const { name, description, certificateDescription } = quizPayload;

    await createQuizSchema.validateAsync({
      name,
      description,
      certificateDescription,
    });

    const existingQuiz = await Quiz.findOne({
      name,
      created_by: new ObjectId(created_by),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (existingQuiz) {
      ReqLogger(req, "error", "A quiz with this name already exists.");
      return res.status(400).json({
        message: "A quiz with this name already exists.",
        success: false,
      });
    }

    let key = "";
    let url = "";
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
        "quiz-images"
      );
      key = imageKey;
      url = imageUrl;
    }

    const sanitizedDescription = sanitizeTemplate(description);
    const sanitizedCertificateDescription = sanitizeTemplate(
      certificateDescription
    );
    const quizCreatePayload = {
      quizId,
      name,
      description: sanitizedDescription,
      certificateDescription: sanitizedCertificateDescription,
      created_by: new ObjectId(created_by),
      organization: new ObjectId(organization),
      quizImage: url,
    };
    const quiz = await Quiz.create({ ...quizCreatePayload, quizImage: key });
    ReqLogger(req, "info", "Quiz Created Successfully");
    return res.status(201).json({
      status: "success",
      message: "Quiz Created successfully",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.addQuestionsToQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      descriptiveAnswers,
      isMultipleAnswer,
    } = req.body;
    const createdBy = req.user._id;

    await quizQuestionSchema.validateAsync({
      question_number,
      question,
      questionType,
      isMultipleAnswer,
      options,
      correctOption,
      descriptiveAnswers,
    });

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quizQuestionPayload = {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      isMultipleAnswer,
      descriptiveAnswers,
      createdBy,
      quiz: new ObjectId(quizId),
      organization: quiz?.organization,
    };

    const newQuestion = await QuizQuestion.create(quizQuestionPayload);

    await Quiz.updateOne(
      { _id: new ObjectId(quizId), organization: quiz?.organization },
      { $push: { questions: newQuestion._id } }
    );

    ReqLogger(req, "info", "Question added successfully");
    return res.json({
      message: "Question added successfully",
      question: newQuestion,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateQuizQuestions = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      descriptiveAnswers,
      isMultipleAnswer,
      questionId,
    } = req.body;
    const created_by = req.user._id;

    await quizQuestionSchema.validateAsync({
      question_number,
      question,
      questionType,
      options,
      isMultipleAnswer,
      correctOption,
      descriptiveAnswers,
    });

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      created_by: new ObjectId(created_by),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quizQuestion = await QuizQuestion.findOne({
      _id: new ObjectId(questionId),
      createdBy: new ObjectId(created_by),
      organization: quiz?.organization,
    });
    if (!quizQuestion) {
      return res.status(400).json({ message: "Invalid data" });
    }

    quizQuestion.question_number = question_number;
    quizQuestion.question = question;
    quizQuestion.questionType = questionType;
    quizQuestion.options = options;
    quizQuestion.correctOption = correctOption;
    quizQuestion.isMultipleAnswer = isMultipleAnswer;
    quizQuestion.descriptiveAnswers = descriptiveAnswers;

    await quizQuestion?.save();

    ReqLogger(req, "info", "Question updated successfully");
    return res.json({
      message: "Question updated successfully",
      question: quizQuestion,
    });
  } catch (error) {
    return next(error);
  }
};

exports.cloneQuestion = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { questionId } = req.body;
    const createdBy = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      created_by: new ObjectId(createdBy),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).populate("questions");

    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quizQuestion = await QuizQuestion.findOne({
      _id: new ObjectId(questionId),
      createdBy: new ObjectId(createdBy),
      organization: quiz?.organization,
    });
    if (!quizQuestion) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const newQuestion = {
      ...quizQuestion?.toObject(),
      _id: new mongoose.Types.ObjectId(),
      question_number: (quiz?.questions?.length || 0) + 1,
      organization: quiz?.organization,
    };

    await QuizQuestion.create(newQuestion);

    await Quiz.updateOne(
      { _id: new ObjectId(quizId), organization: quiz?.organization },
      { $push: { questions: newQuestion._id } }
    );
    ReqLogger(req, "info", "Quiz question cloned successfully");
    return res.json({
      message: "Quiz question cloned successfully",
      clonedQuestion: newQuestion,
    });
  } catch (error) {
    return next(error);
  }
};

exports.addQuestionsToCourseQuiz = async (req, res, next) => {
  try {
    const { courseId, lectureId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      descriptiveAnswers,
      isMultipleAnswer,
      quizId,
    } = req.body;
    const createdBy = req.user._id;
    let quiz = {};

    await quizQuestionSchema.validateAsync({
      question_number,
      question,
      questionType,
      options,
      correctOption,
      isMultipleAnswer,
      descriptiveAnswers,
    });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== createdBy?.toString()) {
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

    if (quizId) {
      quiz = await Quiz.findOne({
        _id: new ObjectId(quizId),
        created_by: new ObjectId(createdBy),
        organization: course?.organization,
        isCourseQuiz: true,
      });
      if (!quiz) {
        return res.status(400).json({ message: "Invalid data" });
      }
    } else {
      const quizId = uuidv4({ format: "hex" });
      quiz = await Quiz.create({
        quizId,
        name: `Quiz: ${courseLecture?.title}`,
        description: `Description: ${courseLecture?.title}`,
        isCourseQuiz: true,
        organization: course?.organization,
        created_by: new ObjectId(createdBy),
      });
    }

    const quizQuestionPayload = {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      isMultipleAnswer,
      descriptiveAnswers,
      createdBy,
      organization: course?.organization,
      quiz: quiz?._id,
    };

    const newQuestion = await QuizQuestion.create(quizQuestionPayload);

    await Quiz.updateOne(
      { _id: quiz?._id, organization: course?.organization },
      { $push: { questions: newQuestion._id } }
    );

    courseLecture.lectureType = "quiz";
    courseLecture.quiz = quiz?._id;

    await courseLecture?.save();

    ReqLogger(req, "info", "Question added successfully");
    return res.json({
      message: "Question added successfully",
      question: newQuestion,
      quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateCourseQuizQuestions = async (req, res, next) => {
  try {
    const { courseId, lectureId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const {
      question_number,
      question,
      questionType,
      options,
      correctOption,
      descriptiveAnswers,
      isMultipleAnswer,
      quizId,
      questionId,
    } = req.body;
    const createdBy = req.user._id;

    await quizQuestionSchema.validateAsync({
      question_number,
      question,
      questionType,
      options,
      isMultipleAnswer,
      correctOption,
      descriptiveAnswers,
    });

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== createdBy?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    const courseLecture = await CourseLecture.findOne({
      _id: new ObjectId(lectureId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!courseLecture) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      created_by: new ObjectId(createdBy),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quizQuestion = await QuizQuestion.findOne({
      _id: new ObjectId(questionId),
      createdBy: new ObjectId(createdBy),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    if (!quizQuestion) {
      return res.status(400).json({ message: "Invalid data" });
    }

    quizQuestion.question_number = question_number;
    quizQuestion.question = question;
    quizQuestion.questionType = questionType;
    quizQuestion.options = options;
    quizQuestion.correctOption = correctOption;
    quizQuestion.isMultipleAnswer = isMultipleAnswer;
    quizQuestion.descriptiveAnswers = descriptiveAnswers;

    await quizQuestion?.save();

    ReqLogger(req, "info", "Question updated successfully");
    return res.json({
      message: "Question updated successfully",
      question: quizQuestion,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteQuizQuestions = async (req, res, next) => {
  try {
    const { quizId, questionId } = req.params;
    const createdBy = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      created_by: new ObjectId(createdBy),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });
    console.log(quiz);
    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const quizQuestion = await QuizQuestion.findOne({
      _id: new ObjectId(questionId),
      createdBy: new ObjectId(createdBy),
      organization: quiz?.organization,
    });
    if (!quizQuestion) {
      return res.status(400).json({ message: "Invalid data" });
    }

    await Quiz.updateOne(
      { _id: new ObjectId(quizId), organization: quiz?.organization },
      { $pull: { questions: new ObjectId(questionId) } }
    );

    await QuizQuestion.deleteOne({
      _id: new ObjectId(questionId),
      organization: quiz?.organization,
    });

    ReqLogger(req, "info", "Question deleted successfully");
    return res.json({ message: "Question deleted successfully" });
  } catch (error) {
    return next(error);
  }
};

exports.addExistingQuizToLecture = async (req, res, next) => {
  try {
    const { lectureId } = req.params;
    const { courseId, quizId } = req.body;
    const createdBy = req.user._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      _id: new ObjectId(courseId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();

    if (!course) {
      return res.status(400).json({ message: "Invalid data" });
    }

    if (course?.created_by?.toString() !== createdBy?.toString()) {
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

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      created_by: new ObjectId(createdBy),
      organization: course?.organization,
    }).populate("questions");
    if (!quiz) {
      return res.status(400).json({ message: "Invalid data" });
    }

    courseLecture.lectureType = "quiz";
    courseLecture.quiz = quiz?._id;

    await courseLecture?.save();

    ReqLogger(req, "info", "Quiz added to lecture successfully");
    return res.json({ message: "Quiz added to lecture successfully", quiz });
  } catch (error) {
    return next(error);
  }
};

exports.createQuizByTemplate = async (req, res, next) => {
  try {
    const data = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { templateId, name } = data;
    const template = await Template.findOne({
      _id: new ObjectId(templateId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!template) {
      return res.status(404).json({
        message: "Template not found",
        success: false,
      });
    }
    if (template.created_by.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: "error",
        message: "You're not Authorized",
        data: {},
      });
    }
    const quizId = uuidv4({ format: "hex" });
    const body = {
      quizId: quizId,
      name: name,
      questions: template.questions,
      answers: template.answers,
      created_by: req.user._id,
      template: template.templateId,
      organization: new ObjectId(organization),
    };
    const quiz = await new Quiz(body).save();
    const quizTransform = quiz.transform();
    return res.status(201).json({
      status: "success",
      message: "Quiz Created successfully",
      data: quizTransform,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getQuiz = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const quizId = req.params.quizId;

    console.log("quizId----------------------->?", quizId);

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate(
        "questions",
        "question_number question options questionType correctOption"
      )
      .exec();
    console.log("quiz----------------------->?", quiz);
    if (!quiz) {
      return res.status(404).json({
        message: "Quiz does not exists",
        success: false,
      });
    }
    console.log(quiz?.questions);
    ReqLogger(req, "info", "Quiz Fetched Successfully");
    return res.status(201).json({
      status: "success",
      message: "Quiz get successfully",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMarketPlaceQuizzes = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;

    const quizzes = await Quiz.find({
      quizPrivacy: "public",
      quizType: "premium",
      isPublished: true,
      organization: { $ne: new ObjectId(organization) },
    })
      .populate("questions", "question_number question options questionType")
      .exec();

    if (!quizzes) {
      ReqLogger(
        req,
        "error",
        "Quizzes Not Found: The specified quizzes could not be located"
      );
      return res.status(404).json({
        message: "Quizzes Not Found",
        success: false,
      });
    }

    const quizIds = quizzes.map((quiz) => quiz._id);
    const purchaseQuizzes = await PurchaseQuiz.find({
      user: mongoose.Types.ObjectId(req?.user?._id),
      quiz: { $in: quizIds },
    }).select("quiz");

    const purchaseQuizMapping = {};
    for (const purchaseQuiz of purchaseQuizzes) {
      purchaseQuizMapping[purchaseQuiz?.quiz?.toString()] = {
        purchaseId: purchaseQuiz?._id?.toString(),
      };
    }

    const updatedQuizzes = [];

    for await (const q of quizzes) {
      if (q.quizImage) {
        q.quizImage = await getSignedUrlFile(q.quizImage);
      }

      updatedQuizzes.push({
        ...q?.toObject(),
        isPurchased: !!purchaseQuizMapping[q?._id?.toString()]?.purchaseId,
        purchaseId: purchaseQuizMapping[q?._id?.toString()]?.purchaseId,
      });
    }
    ReqLogger(req, "info", "Quizzes successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Quizzes successfully retrieved.",
      data: updatedQuizzes,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getQuizForAdmin = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    })
      .populate("questions")
      .exec();
    if (!quiz) {
      return res.status(404).json({
        message: "Quiz does not exists",
        success: false,
      });
    }
    if (quiz.created_by.toString() !== req.user._id.toString()) {
      ReqLogger(req, "error", "You're not Authorized");
      return res.status(403).json({
        status: "error",
        message: "You're not authorized to perform this action",
        data: {},
      });
    }
    if (quiz?.quizImage) {
      quiz.quizImage = await getSignedUrlFile(quiz?.quizImage);
    }
    ReqLogger(req, "info", "Quiz Fetched Successfully");
    return res.status(201).json({
      status: "success",
      message: "Quiz get successfully",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getQuizByUser = async (req, res, next) => {
  try {
    const { role } = req.user;
    const organization = req?.user?.organization;
    const isSuperAdmin = role === "super-admin";
    let quizzes = [];

    if (isSuperAdmin) {
      quizzes = await Quiz.find()
        .populate("questions", "question_number question options questionType")
        .sort({ createdAt: -1 })
        .exec();
    } else {
      quizzes = await Quiz.find({
        created_by: req.user._id,
        organization: new ObjectId(organization),
      })
        .populate("questions", "question_number question options questionType")
        .sort({ createdAt: -1 })
        .exec();
    }

    if (!quizzes.length) {
      ReqLogger(
        req,
        "error",
        "No quizzes have been created or uploaded yet. Please add some quizzes for the users."
      );
      return res.status(404).json({
        message:
          "No quizzes have been created or uploaded yet. Please add some quizzes for the users.",
        success: false,
      });
    }

    // Get total attempts for each quiz with organization check
    const quizzesWithAttempts = await Promise.all(
      quizzes.map(async (quiz) => {
        const attempts = await Report.countDocuments({
          quizId: new ObjectId(quiz._id),
          ...(!isSuperAdmin
            ? { organization: new ObjectId(organization) }
            : {}),
        });

        const quizObj = quiz.toObject();
        quizObj.totalAttempts = attempts;

        return quizObj;
      })
    );

    ReqLogger(
      req,
      "info",
      "Quizzes have been successfully retrieved and are now available for viewing and editing."
    );

    return res.status(201).json({
      status: "success",
      message:
        "Quizzes have been successfully retrieved and are now available for viewing and editing.",
      data: quizzesWithAttempts,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCreatedQuizzes = async (req, res, next) => {
  try {
    const { search } = req.query;
    const userId = req.user?._id;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const filterQuery = queryBuilder([
      { type: "search", field: "name", value: search },
    ]);

    const quizzes = await Quiz.find({
      created_by: new ObjectId(userId),
      isCourseQuiz: false,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      ...filterQuery,
    })
      .populate({
        path: "questions",
      })
      .sort({ createdAt: -1 })
      .exec();

    for await (const quiz of quizzes) {
      if (quiz?.quizImage) {
        quiz.quizImage = await getSignedUrlFile(quiz?.quizImage);
      }
    }

    ReqLogger(req, "info", "Quiz successfully retrieved.");
    return res.status(201).json({
      status: "success",
      message: "Quiz successfully retrieved.",
      data: quizzes,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPublishedQuizByUser = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const body = {
      created_by: req.user._id,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      isPublished: true,
    };
    const { role } = req.user;
    let quiz = [];
    if (role === "admin") {
      quiz = await Quiz.find({
        organization: new ObjectId(organization),
      })
        .populate("questions", "question_number question options questionType")
        .sort({ createdAt: -1 })
        .exec();

      console.log(quiz.length);
    } else {
      quiz = await Quiz.find(body)
        .populate("questions", "question_number question options questionType")
        .sort({ createdAt: -1 })
        .exec();
    }

    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "No quizzes have been published yet. Please create and publish quizzes for the users to access."
      );
      return res.status(404).json({
        message:
          "No quizzes have been published yet. Please create and publish quizzes for the users to access.",
        success: false,
      });
    }
    ReqLogger(
      req,
      "info",
      "Quizzes have been successfully retrieved and are now available for viewing."
    );
    return res.status(201).json({
      status: "success",
      message:
        "Quizzes have been successfully retrieved and are now available for viewing.",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPublishedQuiz = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    let quiz = await Quiz.find({
      isPublished: true,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      created_by: req.user._id,
    })
      .populate("questions", "question_number question options questionType")
      .sort({ createdAt: -1 })
      .exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "No quizzes have been published yet. Please create and publish quizzes for the users to access."
      );
      return res.status(404).json({
        message:
          "No quizzes have been published yet. Please create and publish quizzes for the users to access.",
        success: false,
      });
    }
    ReqLogger(
      req,
      "info",
      "Quiz have been successfully retrieved and is now available for viewing."
    );
    return res.status(201).json({
      status: "success",
      message:
        "Quiz have been successfully retrieved and is now available for viewing.",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPremiumQuiz = async (req, res, next) => {
  try {
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    let quiz = await Quiz.find({
      isPublished: true,
      quizType: "premium",
      created_by: { $ne: new ObjectId(req?.user?.id) },
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
      $or: [{ quizPrivacy: "organization" }, { quizPrivacy: "public" }],
    })
      .populate("questions", "question_number question options questionType")
      .sort({ createdAt: -1 })
      .exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "No premium quizzes have been created or uploaded yet. Please add some to enhance the premium content for users."
      );
      return res.status(404).json({
        message:
          "No premium quizzes have been created or uploaded yet. Please add some to enhance the premium content for users.",
        success: false,
      });
    }
    ReqLogger(
      req,
      "info",
      "Success! Premium quizzes have been successfully fetched. Enjoy the exclusive content!"
    );
    return res.status(201).json({
      status: "success",
      message:
        "Success! Premium quizzes have been successfully fetched. Enjoy the exclusive content!",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { payload } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const file = req?.file;

    const created_by = req.user._id;

    const quizPayload = JSON.parse(payload);

    const { name, description, certificateDescription } = quizPayload;

    let key = "";
    let url = "";

    await createQuizSchema.validateAsync({
      name,
      description,
      certificateDescription,
    });

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "Quiz update not possible as no quizzes are available. Please create some first."
      );
      return res.status(404).json({
        message:
          "Quiz update not possible as no quizzes are available. Please create some first.",
        success: false,
      });
    }

    if (quiz?.created_by?.toString() !== created_by?.toString()) {
      ReqLogger(
        req,
        "error",
        "Forbidden: you are not allowed to edit this quiz."
      );
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    if (
      quiz.organization?.toString() !== req.user.organization?.toString() &&
      req.user.role === "admin"
    ) {
      ReqLogger(req, "error", "Updating a published quiz is not permitted.");
      return res.status(403).json({
        status: "error",
        message: "Updating a published quiz is not permitted.",
        data: {},
      });
    }

    if (quiz?.quizImage) {
      url = await getSignedUrlFile(quiz?.quizImage);
    }

    if (file) {
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
        "quiz-images"
      );
      key = imageKey;
      url = imageUrl;
    }

    const sanitizedDescription = sanitizeTemplate(description);

    const sanitizedCertificateDescription = sanitizeTemplate(
      certificateDescription
    );

    quiz.name = name;
    quiz.description = sanitizedDescription;
    quiz.certificateDescription = sanitizedCertificateDescription;
    if (url && key) {
      quiz.quizImage = key;
    }

    await quiz.save();

    ReqLogger(req, "info", "Successfully updated the quiz!");
    return res.status(200).json({
      status: "success",
      message: "Successfully updated the quiz!",
      data: { ...quiz?.toObject(), quizImage: url },
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateQuizSettings = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const created_by = req.user._id;
    const {
      quizType,
      quizPrice,
      screenshotTime,
      isTabSwiching,
      attemptsOfQuiz,
    } = req.body;

    await updateQuizSettingSchema.validateAsync({
      quizType,
      quizPrice,
      screenshotTime,
      isTabSwiching,
      attemptsOfQuiz,
    });

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "Quiz update not possible as no quizzes are available. Please create some first."
      );
      return res.status(404).json({
        message:
          "Quiz update not possible as no quizzes are available. Please create some first.",
        success: false,
      });
    }

    if (quiz?.created_by?.toString() !== created_by?.toString()) {
      ReqLogger(
        req,
        "error",
        "Forbidden: you are not allowed to edit this quiz."
      );
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }

    quiz.quizType = quizType;
    quiz.quizPrice = quizType === "premium" ? quizPrice : 0;
    quiz.screenshotTime = screenshotTime;
    quiz.isTabSwiching = isTabSwiching;
    quiz.attemptsOfQuiz = attemptsOfQuiz;

    await quiz.save();

    ReqLogger(req, "info", "Successfully updated the quiz!");
    return res.status(200).json({
      status: "success",
      message: "Successfully updated the quiz!",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteQuiz = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const course = await Course.findOne({
      "lectures.quiz": quizId,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    });

    if (course) {
      ReqLogger(req, "error", "Cannot delete quiz. It is part of a course.");
      return res.status(400).json({
        success: false,
        message: "Cannot delete quiz. It is part of a course.",
      });
    }

    console.log("course----------------->", course);

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      organization: organization,
    }).exec();

    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "Deletion unavailable as there are no quizzes. Please create some first."
      );
      return res.status(404).json({
        message:
          "Deletion unavailable as there are no quizzes. Please create some first.",
        success: false,
      });
    }
    if (quiz.created_by.toString() !== req.user._id.toString()) {
      ReqLogger(req, "error", "You're not Authorized");
      return res.status(403).json({
        status: "error",
        message: "You're not authorized to perform this action",
        data: {},
      });
    }
    // if (quiz.isPublished) {
    //   ReqLogger(req, "error", "Deleting a published quiz is not permitted.");
    //   return res.status(405).json({
    //     status: "error",
    //     message: "Deleting a published quiz is not permitted.",
    //     data: {},
    //   });
    // }
    await Quiz.deleteOne({
      _id: new ObjectId(quizId),
      organization: organization,
    });

    ReqLogger(req, "info", "Quiz successfully deleted!");
    return res.status(200).json({
      status: "success",
      message: "Quiz successfully deleted!",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
};

exports.publishQuiz = async (req, res, next) => {
  try {
    const quizId = req.body.quizId;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
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
        "To publish your quiz and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution."
      );
      return res.status(404).json({
        message:
          "To publish your quiz and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution.",
        success: false,
      });
    }

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      // ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "Publishing Quiz unavailable as there are no quizzes. Please create some first."
      );
      return res.status(404).json({
        message:
          "Publishing Quiz unavailable as there are no quizzes. Please create some first.",
        success: false,
      });
    }
    if (quiz.created_by.toString() !== req.user._id.toString()) {
      ReqLogger(req, "error", "You're not Authorized");
      return res.status(403).json({
        status: "error",
        message: "You're not authorized to perform this action",
        data: {},
      });
    }

    quiz.isPublished = true;

    await quiz.save();

    ReqLogger(req, "info", "Quiz successfully published!");
    return res.status(200).json({
      status: "success",
      message: "Quiz successfully published!",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishQuiz = async (req, res, next) => {
  try {
    const quizId = req.body.quizId;
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
        "To publish your quiz and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution."
      );
      return res.status(404).json({
        message:
          "To publish your quiz and start accepting payments, you'll need to connect your Stripe account. This ensures secure transactions and proper revenue distribution.",
        success: false,
      });
    }
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "Publishing Quiz unavailable as there are no quizzes. Please create some first."
      );
      return res.status(404).json({
        message:
          "Publishing Quiz unavailable as there are no quizzes. Please create some first.",
        success: false,
      });
    }
    if (quiz.created_by.toString() !== req.user._id.toString()) {
      ReqLogger(req, "error", "You're not Authorized");
      return res.status(403).json({
        status: "error",
        message: "You're not authorized to perform this action",
        data: {},
      });
    }

    quiz.isPublished = false;

    await quiz.save();

    ReqLogger(req, "info", "Quiz successfully unpublished!");
    return res.status(200).json({
      status: "success",
      message: "Quiz successfully unpublished!",
      data: quiz,
    });
  } catch (error) {
    return next(error);
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

exports.shareQuiz = async (req, res, next) => {
  try {
    const userData = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);

    const { emails, quizId } = userData;

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      isPublished: true,
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
      ReqLogger(
        req,
        "error",
        "No quiz have been created or uploaded yet. Please add some quizzes for the users."
      );
      return res.status(404).json({
        message:
          "No quiz have been created or uploaded yet. Please add some quizzes for the users.",
        success: false,
      });
    }

    const notFoundEmails = [];
    const sentEmails = [];

    for (const email of emails) {
      console.log(email.value);
      const existignUser = await User.findOne({
        email: email.value,
        organization: quiz?.organization,
      }).exec();
      if (!existignUser) {
        notFoundEmails.push(email);
        continue;
      }
      const token = makeToken(email.value);
      const tokenRecord = new Token({
        token,
        email: email.value,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 72 * 60 * 60 * 1000),
        organization: quiz?.organization,
      });
      await tokenRecord.save();
      emailProvider.sendQuizInvite(existignUser, stripHtml(token), quiz);

      console.log("invite----------->", existignUser._id);

      const body = {
        quiz: quiz?._id,
        user: existignUser._id,
        invitedBy: req.user._id,
        organization: quiz?.organization,
      };

      const invitedUser = await Invite.create(body);
      console.log("invitedUser---------------->", invitedUser);
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

exports.updateQuizPrivacy = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { quizPrivacy } = req.body;
    const organization = req?.user?.organization;
    const isSuperAdmin = isSuperAdminUser(req?.user);
    const { quizId } = req.params;

    await quizPrivacySchema.validateAsync({ quizPrivacy });

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      ...(!isSuperAdmin ? { organization: new ObjectId(organization) } : {}),
    }).exec();
    if (!quiz) {
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

    if (quiz?.created_by?.toString() !== userId?.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    quiz.quizPrivacy = quizPrivacy;
    await quiz.save();

    ReqLogger(req, "info", "Course updated successfully");
    return res.json({ message: "Course updated successfully", quizPrivacy });
  } catch (error) {
    return next(error);
  }
};
