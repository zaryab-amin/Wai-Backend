const NotificationRead = require("../models/notificationRead.model");
const { ObjectId } = require("mongodb");

exports.getUnreadNotifications = async (req, res, next) => {
  try {
    const userId = req?.user?._id
    const notifications = await NotificationRead.find({
      adminId: new ObjectId(userId),
      readAt: null
    })
      .populate('notificationId')
      .exec();

    const count = notifications?.length;

    return res.status(200).json({
      success: true,
      data: { notifications, count },
    });
  } catch (error) {
    next(error);
  }
};

exports.markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req?.user?._id
    await NotificationRead.updateMany(
      {
        adminId: new ObjectId(userId),
      },
      { readAt: new Date() }
    );

    return res.status(200).json({
      success: true,
      message: "Notification read successfully"
    });
  } catch (error) {
    next(error);
  }
};