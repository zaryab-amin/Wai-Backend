const Quiz = require("../models/quiz.model");
const Report = require("../models/report.model");
const Purchase = require("../models/purchase.model");
const { v4: uuidv4 } = require("uuid");
const { ReqLogger } = require("../utils/Logger");
const OpenAI = require("openai");
const Invite = require("../models/invite.model");
const { ObjectId } = require("mongodb");
const PurchaseQuiz = require("../models/purchaseQuiz.model");
const Certificate = require("../models/certificate.model");
const mongoose = require("mongoose");
const { getConfig } = require("../../config/vars");

const config = getConfig();

const openai = new OpenAI({
  apiKey: config.openAIKey,
});

exports.startExam = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;
    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      // organization: organizationId ? new ObjectId(organizationId) : undefined,
    })
      .populate(
        "questions",
        "question_number question options questionType isMultipleAnswer"
      )
      .exec();
    if (!quiz) {
      ReqLogger(req, "error", "The quiz does not exist.");
      return res.status(404).json({
        message: "The quiz does not exist.",
        success: false,
      });
    }
    if (!quiz.isPublished) {
      ReqLogger(
        req,
        "error",
        "This quiz is currently not published. Please review and publish it when ready."
      );
      return res.status(405).json({
        message:
          "This quiz is currently not published. Please review and publish it when ready.",
        success: false,
      });
    }
    const purchasedQuiz = await PurchaseQuiz.findOne({
      user: new ObjectId(req.user._id),
      quiz: new ObjectId(quizId),
    }).exec();

    if (!purchasedQuiz) {
      ReqLogger(req, "info", "Purchased quiz not found.");
      return res.status(400).json({
        status: "error",
        message: "Purchased quiz not found",
      });
    }

    console.log("purchasedQuiz--------->", purchasedQuiz);

    if (!purchasedQuiz?.hasPurchased) {
      ReqLogger(req, "info", "Please verify the purchase first");
      return res.status(400).json({
        status: "error",
        message: "Please verify the purchase first",
      });
    }
    const report = await Report.find({
      userId: req.user._id,
      quizId: new ObjectId(quizId),
      // organization: organizationId ? new ObjectId(organizationId) : undefined,
    }).exec();
    if (report.length >= quiz.attemptsOfQuiz) {
      ReqLogger(
        req,
        "error",
        "Unfortunately, you are unable to attempt this exam as you have reached the maximum limit of attempts allowed for this exam."
      );
      return res.status(400).json({
        name: quiz.name,
        description: quiz.description,
        message:
          "Unfortunately, you are unable to attempt this exam as you have reached the maximum limit of attempts allowed for this exam.",
        success: false,
      });
    }
    ReqLogger(req, "info", "Quiz details have been successfully retrieved. ");
    return res.status(201).json({
      status: "success",
      message: "Quiz details have been successfully retrieved. ",
      data: quiz,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitExam = async (req, res, next) => {
  try {
    const {
      quizId,
      purchaseId,
      userAnswers,
      // attempted_questions,
      // descriptiveAnswers = {}, // Default to an empty object if undefined
      feedback,
      quizStarted,
      quizEnded,
    } = req.body;
    const userId = req.user._id;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;

    const quiz = await Quiz.findOne({
      _id: new ObjectId(quizId),
      // organization: organizationId ? new ObjectId(organizationId) : undefined,
    })
      .populate("questions")
      .exec();

    if (!quiz) {
      return res
        .status(400)
        .json({ status: "fail", message: "Quiz not found" });
    }

    const purchasedQuiz = await PurchaseQuiz.findOne({
      _id: new ObjectId(purchaseId),
      user: new ObjectId(req.user._id),
      quiz: new ObjectId(quizId),
      // organization: organizationId ? new ObjectId(organizationId) : undefined,
    }).exec();

    if (!purchasedQuiz) {
      ReqLogger(req, "info", "Purchased quiz not found.");
      return res.status(400).json({
        status: "error",
        message: "Purchased quiz not found",
      });
    }

    if (!purchasedQuiz?.hasPurchased) {
      ReqLogger(req, "info", "Please verify the purchase first");
      return res.status(400).json({
        status: "error",
        message: "Please verify the purchase first",
      });
    }

    const totalScore = quiz.questions.length;
    let score = 0;

    for await (const question of quiz.questions) {
      const userAnswer = userAnswers[question?._id];
      if (question.type === "descriptiveQuestion") {
        const descriptiveAnswers = question.descriptiveAnswers;
        const modelId = "gpt-3.5-turbo";
        const promptText = `${descriptiveAnswers}\n\n Compare the following answer: ${userAnswer?.value} with the assumed answers and provide a similarity score.`;

        const result = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: "user", content: promptText }],
        });
        const response = result.data.choices[0]?.message?.content;
        console.log("AI Response:", response);
        // check response from open ai and see if similarity score is greater than 80% and then increment the score
        continue;
      }

      if (
        question?.correctOption?.includes(userAnswer?.value) &&
        !question?.isMultipleAnswer
      ) {
        score += 1;
      }

      if (question?.isMultipleAnswer) {
        // Check if all correct options are selected by the user
        const allCorrectSelected = question?.correctOption.every((option) =>
          userAnswer?.value?.includes(option)
        );

        // Check if the user has selected only the correct options
        const noExtraSelected = userAnswer?.value?.every((answer) =>
          question?.correctOption.includes(answer)
        );

        if (allCorrectSelected && noExtraSelected) {
          score += 1;
        }
      }
    }

    // Update the user submission status
    await Invite.findOneAndUpdate(
      {
        user: userId,
        quiz: new ObjectId(quizId),
        isSubmitted: false,
        // organization: organizationId ? new ObjectId(organizationId) : undefined,
      },
      { $set: { isSubmitted: true } },
      { new: true }
    );

    const reportId = uuidv4({ format: "hex" });
    // Save the report with the calculated score and attempted answers
    const result = new Report({
      userId,
      quizId: quiz?._id,
      reportId,
      attempted_questions: userAnswers,
      descriptive_answers: {},
      score,
      feedback,
      totalScore,
      quizStarted,
      quizEnded,
      organization: purchasedQuiz?.organization,
    });
    const data = await result.save();

    await PurchaseQuiz.updateOne(
      {
        _id: new ObjectId(purchaseId),
        user: new ObjectId(userId),
        quiz: new ObjectId(quizId),
        organization: purchasedQuiz?.organization,
      },
      {
        $set: {
          report: data?._id,
        },
      }
    );

    const certificateId = new mongoose.Types.ObjectId();
    const percentage = (score / totalScore) * 100;

    if (percentage >= 70) {
      const uuid = uuidv4({ format: "hex" });
      const newCertificate = await new Certificate({
        _id: certificateId,
        user: new ObjectId(userId),
        certificateTitle: quiz?.name,
        certificateDescription: quiz?.certificateDescription,
        certificateId: uuid.substring(0, 8),
        organization: purchasedQuiz?.organization,
        quiz: new ObjectId(quizId),
      }).save();
    }

    ReqLogger(
      req,
      "info",
      "Your exam has been successfully submitted! Thank you for your effort."
    );

    return res.status(201).json({
      status: "success",
      message:
        "Your exam has been successfully submitted! Thank you for your effort.",
      result: {
        score,
        totalScore,
        report: data?._id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitCourseLectureQuiz = async (req, res, next) => {
  try {
    const { quizId, purchaseId } = req.params;
    const { userAnswers, lectureId, quizStarted, quizEnded, feedback } =
      req.body;
    const userId = req.user._id;
    const organizationId =
      req.user?.role === "super-admin" ? undefined : req.user.organization;

    const quiz = await Quiz.findOne({ _id: new ObjectId(quizId) })
      .populate("questions")
      .exec();

    if (!quiz) {
      return res.status(400).json({ status: "fail", message: "Invalid data" });
    }

    const purchasedCourse = await Purchase.findOne({
      _id: new ObjectId(purchaseId),
      user: new ObjectId(userId),
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
    let score = 0;
    for await (const question of quiz.questions) {
      const userAnswer = userAnswers[question?._id];
      if (question.type === "descriptiveQuestion") {
        const descriptiveAnswers = question.descriptiveAnswers;
        const modelId = "gpt-3.5-turbo";
        const promptText = `${descriptiveAnswers}\n\n Compare the following answer: ${userAnswer?.value} with the assumed answers and provide a similarity score.`;

        const result = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: "user", content: promptText }],
        });
        const response = result.data.choices[0]?.message?.content;
        console.log("AI Response:", response);
        // check response from open ai and see if similarity score is greater than 80% and then increment the score
        continue;
      }
      if (
        question?.correctOption?.includes(userAnswer?.value) &&
        !question?.isMultipleAnswer
      ) {
        score += 1;
      }

      if (question?.isMultipleAnswer) {
        // Check if all correct options are selected by the user
        const allCorrectSelected = question?.correctOption.every((option) =>
          userAnswer?.value?.includes(option)
        );

        // Check if the user has selected only the correct options
        const noExtraSelected = userAnswer?.value?.every((answer) =>
          question?.correctOption.includes(answer)
        );

        if (allCorrectSelected && noExtraSelected) {
          score += 1;
        }
      }
    }

    const reportId = uuidv4({ format: "hex" });
    const totalScore = quiz?.questions?.length;
    const result = new Report({
      userId: new ObjectId(userId),
      quizId: quiz?._id,
      reportId,
      attempted_questions: userAnswers,
      descriptive_answers: {},
      score,
      totalScore,
      quizStarted,
      quizEnded,
      feedback,
      organization: purchasedCourse?.organization,
    });

    const data = await result.save();

    // complete lecture progress to 100 once the quiz is submitted
    await Purchase.updateOne(
      {
        _id: new ObjectId(purchaseId),
        user: new ObjectId(userId),
        organization: purchasedCourse?.organization,
        "lectures.lecture": lectureId,
      },
      {
        $set: {
          "lectures.$.progress": 100,
          "lectures.$.completedAt": new Date(),
          "lectures.$.report": data?._id,
        },
      }
    );

    ReqLogger(
      req,
      "info",
      "Your quiz has been successfully submitted! Thank you for your effort."
    );
    return res.status(201).json({
      status: "success",
      message:
        "Your quiz has been successfully submitted! Thank you for your effort.",
      result: {
        score,
        totalScore,
        report: data?._id,
      },
    });
  } catch (error) {
    return next(error);
  }
};
