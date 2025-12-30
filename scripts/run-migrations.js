const { MongoClient } = require("mongodb");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

async function runMigrations() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    // Read all JS files directly inside /scripts
    const migrationFiles = fs
      .readdirSync(path.join(__dirname))
      .filter((file) => file.endsWith(".js") && file !== "runMigrations.js")
      .sort();

    for (const file of migrationFiles) {
      console.log(`🔁 Running migration: ${file}`);
      const migration = require(`./${file}`);
      await migration.up(db);
      console.log(`✅ Migration ${file} applied`);
    }

    console.log("🎉 All migrations completed");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.close();
  }
}

runMigrations();
