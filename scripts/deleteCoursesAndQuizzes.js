const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "academy-dev";

const client = new MongoClient(uri, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
});

// 👉 Replace this with the _id of the course you want to keep
const courseIdToKeep = new ObjectId("65d8d8225951a5001abff90f");

async function deleteExceptOneCourseAndAllQuizzes() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    const db = client.db(dbName);

    // Delete all courses except the one with courseIdToKeep
    const coursesDeleted = await db
      .collection("courses")
      .deleteMany({ _id: { $ne: courseIdToKeep } });
    console.log(`🗑️ Deleted ${coursesDeleted.deletedCount} courses (except one)`);

    // Delete all quizzes
    const quizzesDeleted = await db.collection("quizzes").deleteMany({});
    console.log(`🗑️ Deleted ${quizzesDeleted.deletedCount} quizzes`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await client.close();
    console.log("🔒 MongoDB connection closed");
  }
}

deleteExceptOneCourseAndAllQuizzes().catch(console.error);
