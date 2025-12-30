const up = async (db) => {
  try {
    const quizquestions = db.collection("quizquestions");
    const questions = await quizquestions.find({}).toArray();

    for await (const question of questions) {
      if ("isMultipleAnswer" in question) {
        continue;
      } else {
        const updatedData = {
          isMultipleAnswer: false,
          correctOption: question.correctOption ? [question.correctOption] : [],
        };

        // Update the individual question
        await quizquestions.updateOne(
          { _id: question._id },
          { $set: updatedData }
        );
      }
    }

    console.log("successfully updated the questions");
  } catch (error) {
    console.log(error);
    throw error;
  }
};

module.exports = { up };
