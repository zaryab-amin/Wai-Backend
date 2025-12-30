const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const up = async (db) => {
  try {
    // const purchasequizzes = db.collection("purchasequizzes");
    const organizations = db.collection("organizations");
    const courses = db.collection("courses");
    const quizzes = db.collection("quizzes");

    const organizationIndexes = await organizations.indexes(); // Fetch all indexes
    console.log(organizationIndexes);

    const emailIndex = organizationIndexes.find(
      (index) => index.name === "email_1"
    );

    if (emailIndex) {
      await organizations.dropIndex("email_1");
      console.log("Index 'email_1' removed successfully.");
    } else {
      console.log("Index 'email_1' does not exist.");
    }

    const courseIndexes = await courses.indexes(); // Fetch all indexes
    console.log(courseIndexes);

    const courseNameIndex = courseIndexes.find(
      (index) => index.name === "courseName_1"
    );

    if (courseNameIndex) {
      await courses.dropIndex("courseName_1");
      console.log("Index 'courseName_1' removed successfully.");
    } else {
      console.log("Index 'courseName_1' does not exist.");
    }

    const quizIndexes = await quizzes.indexes(); // Fetch all indexes
    console.log(quizIndexes);

    const quizNameIndex = quizIndexes.find((index) => index.name === "name_1");

    if (quizNameIndex) {
      await quizzes.dropIndex("name_1");
      console.log("Index 'name_1' removed successfully.");
    } else {
      console.log("Index 'name_1' does not exist.");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
