const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const up = async (db) => {
  try {
    console.log(`Database: ${db.databaseName}\n`);
    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      console.log("No collections found in database.");
      return;
    }
    let globalOrgs = new Set();
    for (const collection of collections) {
      const coll = db.collection(collection.name);
      let orgs = [];
      try {
        orgs = await coll.distinct("organization");
        orgs = orgs.filter((o) => o !== null && o !== undefined && o !== "");
        orgs.forEach((o) => globalOrgs.add(String(o)));
      } catch (e) {
        continue;
      }
      console.log(`Collection: ${collection.name}`);
      if (orgs.length === 0) {
        console.log("  No organization field or no organizations found.");
      } else {
        orgs.forEach((org, i) => {
          console.log(`  ${i + 1}. ${org}`);
        });
      }
      console.log("");
    }

    console.log("==============================");
    console.log("All unique organization IDs in database:");
    if (globalOrgs.size === 0) {
      console.log("  None found.");
    } else {
      Array.from(globalOrgs).forEach((org, i) => {
        console.log(`  ${i + 1}. ${org}`);
      });
    }
    console.log("==============================");
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
};

module.exports = { up };

if (require.main === module) {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri);

  client
    .connect()
    .then(async () => {
      console.log("✅ Connected to MongoDB");
      const db = client.db();
      await up(db);
    })
    .catch((err) => console.error("❌ Connection error:", err))
    .finally(() => client.close());
}
