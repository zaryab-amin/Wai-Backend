const Notification = require('../models/notification.model');
const NotificationRead = require('../models/notificationRead.model');
const User = require('../models/user.model');
const { ObjectId } = require("mongodb");
const { InfoLogger } = require('../utils/Logger');
const { getConfig } = require('../../config/vars');

exports.createPurchaseNotification = async ({
  purchaseId = null,
  subscriptionId = null,
  organization,
  title,
  message
}) => {
  try {
    const config = getConfig();
    const notification = await Notification.create({
      purchaseId,
      organization,
      subscriptionId,
      title,
      message
    });

    // Get all admins of the organization
    const admins = await User.find({
      $or: [
        { organization: new ObjectId(organization) },
        { organization: new ObjectId(config.prescientOrgId) },
      ],
      $or: [
        { role: "admin" },
        { role: "super-admin" },
        { role: "organization" },
      ],
    });

    console.log(admins, "=====admins")

    // Create unread entries for all admins
    const notificationReads = admins.map(admin => ({
      notificationId: notification._id,
      adminId: admin._id,
      readAt: null,
    }));
    await NotificationRead.insertMany(notificationReads);
  } catch (error) {
    InfoLogger({}, "error", `Error creating notifications: ${JSON.stringify(error)}`)
  }
}