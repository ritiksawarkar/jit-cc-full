import Notification from "../models/Notification.js";
import mongoose from "mongoose";

/**
 * Get all notifications for the logged-in student
 * Query params: type, isRead, priority, limit
 */
export async function getMyNotifications(req, res) {
  try {
    const userId = req.user.id;
    const { type, isRead, priority, limit = 50, skip = 0 } = req.query;

    // Build filter
    const filter = {
      userId,
      isArchived: false,
    };

    if (type) filter.type = type;
    if (isRead !== undefined) filter.isRead = isRead === "true";
    if (priority) filter.priority = priority;

    // Fetch notifications (newest first)
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate("eventId", "title startAt endAt")
      .populate("problemId", "title")
      .populate("submissionId", "languageId result")
      .populate("certificateId", "certificateNo merit")
      .populate("senderId", "name email")
      .lean();

    // Get total count
    const total = await Notification.countDocuments(filter);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
      isArchived: false,
    });

    // Get pinned notifications
    const pinnedCount = await Notification.countDocuments({
      userId,
      isPinned: true,
      isArchived: false,
    });

    res.status(200).json({
      notifications,
      total,
      unreadCount,
      pinnedCount,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Unable to fetch notifications" });
  }
}

/**
 * Get notification summary (badge counts)
 */
export async function getNotificationSummary(req, res) {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
      isArchived: false,
    });

    const unreadByType = await Notification.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          isRead: false,
          isArchived: false,
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const critical = await Notification.countDocuments({
      userId,
      isRead: false,
      priority: "critical",
      isArchived: false,
    });

    const pinned = await Notification.findOne({
      userId,
      isPinned: true,
      isArchived: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      unreadCount,
      critical,
      unreadByType: unreadByType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      lastPinned: pinned,
    });
  } catch (err) {
    console.error("Error fetching notification summary:", err);
    res.status(500).json({ error: "Unable to fetch notification summary" });
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ notification });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Unable to update notification" });
  }
}

/**
 * Mark multiple notifications as read
 */
export async function markAllNotificationsAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: "No notification IDs provided" });
    }

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        userId,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );

    res.status(200).json({
      message: "Notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ error: "Unable to update notifications" });
  }
}

/**
 * Archive a notification
 */
export async function archiveNotification(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      {
        isArchived: true,
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ message: "Notification archived" });
  } catch (err) {
    console.error("Error archiving notification:", err);
    res.status(500).json({ error: "Unable to archive notification" });
  }
}

/**
 * Archive all read notifications
 */
export async function archiveAllReadNotifications(req, res) {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      {
        userId,
        isRead: true,
        isArchived: false,
      },
      {
        isArchived: true,
      },
    );

    res.status(200).json({
      message: "Read notifications archived",
      archivedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error archiving notifications:", err);
    res.status(500).json({ error: "Unable to archive notifications" });
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ message: "Notification deleted" });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({ error: "Unable to delete notification" });
  }
}

/**
 * Pin a notification
 */
export async function pinNotification(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      {
        isPinned: true,
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ notification });
  } catch (err) {
    console.error("Error pinning notification:", err);
    res.status(500).json({ error: "Unable to pin notification" });
  }
}

/**
 * ADMIN: Create and send notification to student(s)
 */
export async function createNotification(req, res) {
  try {
    const {
      userId,
      userIds,
      type,
      title,
      message,
      description,
      eventId,
      problemId,
      priority,
      actionUrl,
      actionLabel,
      metadata,
    } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        error: "type, title, and message are required",
      });
    }

    if (!userId && !userIds) {
      return res.status(400).json({
        error: "userId or userIds is required",
      });
    }

    // Single or bulk creation
    const recipients = userId ? [userId] : userIds;

    const notificationDocs = recipients.map((id) => ({
      userId: id,
      type,
      title,
      message,
      description: description || "",
      eventId: eventId || null,
      problemId: problemId || null,
      priority: priority || "normal",
      actionUrl: actionUrl || null,
      actionLabel: actionLabel || null,
      senderId: req.user?.id || null,
      metadata: metadata || {},
    }));

    const created = await Notification.insertMany(notificationDocs);

    res.status(201).json({
      message: "Notification(s) created successfully",
      notifications: created,
      count: created.length,
    });
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ error: "Unable to create notification" });
  }
}

/**
 * ADMIN: Get all notifications (for debugging/monitoring)
 */
export async function getAllNotifications(req, res) {
  try {
    const { userId, type, isRead, priority, limit = 100, skip = 0 } = req.query;

    const filter = {};

    if (userId) filter.userId = userId;
    if (type) filter.type = type;
    if (isRead !== undefined) filter.isRead = isRead === "true";
    if (priority) filter.priority = priority;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate("userId", "name email")
      .populate("senderId", "name email")
      .lean();

    const total = await Notification.countDocuments(filter);

    res.status(200).json({
      notifications,
      total,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (err) {
    console.error("Error fetching all notifications:", err);
    res.status(500).json({ error: "Unable to fetch notifications" });
  }
}
