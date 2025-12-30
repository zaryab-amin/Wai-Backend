const updatePurchaseTypes = async (courseInvoices) => {
  try {
    const count = await courseInvoices.countDocuments();
    console.log("Total documents:", count);
    const sampleDoc = await courseInvoices.findOne();
    console.log("Sample document:", sampleDoc);
    if (count > 0) {
      const result = await courseInvoices.updateMany(
        {},
        { $set: { purchaseType: "course" } }
      );
      console.log(`Updated ${result.modifiedCount} documents`);
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

const up = async (db) => {
  try {
    const courseInvoices = db.collection("courseinvoices");
    await updatePurchaseTypes(courseInvoices);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
