const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI + 'academy-dev';
const dumpFolder = path.join(__dirname, '../db-dump');

async function run() {
  const client = new MongoClient(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const files = fs.readdirSync(dumpFolder).filter(file => file.endsWith('.json'));

    for (const file of files) {
      const collectionName = path.basename(file, '.json');
      const data = fs.readFileSync(path.join(dumpFolder, file), 'utf-8');
      const documents = data.trim().split('\n').map(line => JSON.parse(line));

      if (documents.length > 0) {
        const result = await db.collection(collectionName).insertMany(documents);
        console.log(`✅ Inserted ${result.insertedCount} docs into ${collectionName}`);
      } else {
        console.log(`⚠️ No documents found in ${file}`);
      }
    }

  } catch (err) {
    console.error('❌ Import error:', err);
  } finally {
    await client.close();
    console.log('🔌 Disconnected');
  }
}

run();