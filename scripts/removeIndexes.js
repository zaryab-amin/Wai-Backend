const path = require("path");

const up = async (db) => {
  // const purchasequizzes = db.collection("purchasequizzes");
  const organizations = db.collection("organizations");

  const indexes = await organizations.indexes(); // Fetch all indexes
  console.log(indexes);
};

module.exports = { up };
