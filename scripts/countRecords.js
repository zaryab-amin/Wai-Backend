const up = async (db) => {
  try {
    console.log(`Database: ${db.databaseName}`);
    console.log("");

    // Get all collections
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log("📊 No collections found in database");
      return;
    }

    console.log(`📁 Found ${collections.length} collections:`);
    console.log("");

    let totalRecords = 0;

    for (const collection of collections) {
      try {
        const coll = db.collection(collection.name);
        const count = await coll.countDocuments();
        totalRecords += count;

        console.log(`📊 ${collection.name}: ${count} records`);
      } catch (error) {
        console.log(`❌ ${collection.name}: Error - ${error.message}`);
      }
    }

    console.log("");
    console.log(`📈 Total records: ${totalRecords}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
};

module.exports = { up };
