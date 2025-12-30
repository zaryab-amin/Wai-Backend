const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const restructureQuizzes = async (quizCollection, quizQuestionCollection) => {
  try {
    try {
      const quizzes = await quizCollection.find();
      for await (const quiz of quizzes) {
        const quizQuestions = [];
        for (const question of quiz?.questions) {
          if (mongoose.Types.ObjectId.isValid(question)) {
            continue;
          }
          const newQuestion = await quizQuestionCollection.insertOne({
            question_number: question?.question_number,
            question: question?.question,
            questionType: question?.questionType,
            options: question?.options?.map((option) => ({
              optionId: option?._id?.toString(),
              value: option?.value,
            })),
            descriptiveAnswers: question?.descriptiveAnswers?.map((option) => ({
              answerId: option?._id?.toString(),
              value: option?.value,
            })),
            correctOption:
              question?.options?.[quiz?.answers?.[question?.question_number]]
                ?._id,
            quiz: quiz?._id,
            organization: quiz?.organization,
          });
          quizQuestions.push(newQuestion?.insertedId);
        }
        await quizCollection.updateOne(
          { _id: quiz?._id },
          {
            $set: {
              questions: quizQuestions,
            },
          }
        );
      }
      console.log("Data migration completed successfully for quizzes!");
    } catch (err) {
      console.error("Data migration failed for quizzes:", err);
    }
  } catch (error) {
    console.error("Error restructuring quizzes", error);
    return {};
  }
};

const restructureCourses = async (
  courseCollection,
  courseModuleCollection,
  courseLectureCollection,
  lectureVideoCollection
) => {
  try {
    try {
      const courses = await courseCollection.find();
      for await (const course of courses) {
        const courseLectures = [];
        const courseModules = [];
        let moduleId = "";
        for (const lecture of course?.lectures) {
          if (mongoose.Types.ObjectId.isValid(lecture)) {
            continue;
          }
          if (!moduleId) {
            const moduleUuid = uuidv4({ format: "hex" });
            const courseModule = await courseModuleCollection.insertOne({
              moduleTitle: `Module: ${course?.courseName}`,
              course: course?._id,
              status: "published",
              order: 1,
              moduleId: moduleUuid,
              organization: course?.organization,
            });
            moduleId = courseModule?.insertedId;
          }
          const newLecture = await courseLectureCollection.insertOne({
            lectureId: uuidv4({ format: "hex" }),
            title: lecture?.title,
            duration: 0,
            lectureType: lecture?.lectureType,
            order: courseLectures?.length + 1,
            lectureContent: lecture?.lectureContent,
            description: null,
            videoSrc: lecture?.video || null,
            quiz: lecture?.quiz || null,
            status: "published",
            module: moduleId,
            course: course._id,
            updatedAt: lecture.updatedAt,
            organization: course?.organization,
          });
          if (!courseModules?.includes(moduleId)) {
            courseModules.push(moduleId);
          }
          courseLectures.push(newLecture?.insertedId);
        }
        await courseModuleCollection.updateOne(
          { _id: moduleId },
          {
            $set: {
              lectures: courseLectures,
            },
          }
        );
        await courseCollection.updateOne(
          { _id: course?._id },
          {
            $set: {
              lectures: courseLectures,
              modules: courseModules,
              status: "published",
            },
          }
        );
      }
      console.log("Data migration completed successfully for courses!");
    } catch (err) {
      console.error("Data migration failed for courses:", err);
    }
  } catch (error) {
    console.error("Error restructuring courses", error);
    return {};
  }
};

const up = async (db) => {
  try {
    const courselectures = db.collection("courselectures");
    const coursemodules = db.collection("coursemodules");
    const courses = db.collection("courses");
    const lecturevideos = db.collection("lecturevideos");
    const quizquestions = db.collection("quizquestions");
    const quizzes = db.collection("quizzes");
    await restructureQuizzes(quizzes, quizquestions);
    await restructureCourses(
      courses,
      coursemodules,
      courselectures,
      lecturevideos
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
