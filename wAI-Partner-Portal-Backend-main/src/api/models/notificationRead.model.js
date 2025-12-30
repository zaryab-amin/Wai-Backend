const mongoose = require('mongoose');

const notificationReadSchema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: { type: Date, default: null },
});

module.exports = mongoose.model('NotificationRead', notificationReadSchema);