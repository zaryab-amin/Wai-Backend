const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseInvoice', default: null },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
