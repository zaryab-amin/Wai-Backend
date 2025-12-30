const updateInvoicePurchaseTypes = async (invoices) => {
  try {
    const allInvoices = await invoices.find();
    for await (const invoice of allInvoices) {
      await invoices.updateOne(
        { _id: invoice._id },
        { $set: { purchaseType: "subscription" } }
      );
    }
    console.log("Updated all invoice purchase types to 'subscription'");
  } catch (error) {
    console.error("Error updating invoice purchase types:", error);
    throw error;
  }
};

const up = async (db) => {
  try {
    const invoices = db.collection("invoices");
    await updateInvoicePurchaseTypes(invoices);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

module.exports = { up };
