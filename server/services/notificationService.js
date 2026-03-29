/**
 * Notification Helper Service
 * Easy-to-use functions for creating notifications from anywhere in the backend
 * Usage: import { notifyStudent, notifyAccountFreeze } from "../services/notificationService.js"
 */

import Notification from "../models/Notification.js";

/**
 * Create notification for a single student
 */
export async function notifyStudent(userId, payload) {
  try {
    const notification = await Notification.create({
      userId,
      ...payload,
      createdAt: new Date(),
    });
    return notification;
  } catch (err) {
    console.error("Error creating notification:", err);
    throw err;
  }
}

/**
 * Create notifications for multiple students (bulk)
 */
export async function notifyStudents(userIds, payload) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("userIds must be a non-empty array");
    }

    const notifications = userIds.map((userId) => ({
      userId,
      ...payload,
      createdAt: new Date(),
    }));

    const result = await Notification.insertMany(notifications);
    return result;
  } catch (err) {
    console.error("Error creating bulk notifications:", err);
    throw err;
  }
}

/**
 * EVENT NOTIFICATIONS
 */

export async function notifyEventCreated(userIds, event) {
  return notifyStudents(userIds, {
    type: "event",
    title: `📢 New Event: ${event.title}`,
    message: `A new event "${event.title}" is now available for registration`,
    description: event.description,
    eventId: event._id,
    priority: "high",
    actionUrl: "/compiler",
    actionLabel: "View Event",
    metadata: { eventId: String(event._id) },
  });
}

export async function notifyEventStarted(userIds, event) {
  return notifyStudents(userIds, {
    type: "event",
    title: `🚀 Event Started: ${event.title}`,
    message: `${event.title} has started! Start coding now.`,
    eventId: event._id,
    priority: "critical",
    actionUrl: "/compiler",
    actionLabel: "Go to Compiler",
    metadata: { eventId: String(event._id) },
  });
}

export async function notifyEventEnded(userIds, event) {
  return notifyStudents(userIds, {
    type: "event",
    title: `⏱️ Event Ended: ${event.title}`,
    message: `${event.title} has ended. Check your results on the dashboard.`,
    eventId: event._id,
    priority: "normal",
    actionUrl: "/dashboard",
    actionLabel: "View Results",
    metadata: { eventId: String(event._id) },
  });
}

export async function notifyProblemReleased(userIds, event, problem) {
  return notifyStudents(userIds, {
    type: "problem",
    title: `📝 New Problem: ${problem.title}`,
    message: `A new problem has been released in ${event.title}`,
    description: problem.title,
    problemId: problem._id,
    eventId: event._id,
    priority: "high",
    actionUrl: "/compiler",
    actionLabel: "View Problem",
    metadata: { problemId: String(problem._id) },
  });
}

export async function notifyProblemUpdated(userIds, problem) {
  return notifyStudents(userIds, {
    type: "problem",
    title: `🔄 Problem Updated: ${problem.title}`,
    message: "A problem statement has been updated. Please review the changes.",
    description: problem.title,
    problemId: problem._id,
    priority: "normal",
    actionUrl: "/compiler",
    actionLabel: "Review Problem",
    metadata: { problemId: String(problem._id) },
  });
}

/**
 * SUBMISSION NOTIFICATIONS
 */

export async function notifySubmissionPassed(userId, submission, score = 100) {
  return notifyStudent(userId, {
    type: "submission",
    title: `✅ All Tests Passed!`,
    message: `Your submission scored ${score}/100 - Perfect!`,
    submissionId: submission._id,
    priority: "high",
    actionUrl: "/compiler",
    actionLabel: "View Results",
    metadata: { score, submissionId: String(submission._id) },
  });
}

export async function notifySubmissionFailed(userId, submission, failed = 1) {
  return notifyStudent(userId, {
    type: "submission",
    title: `❌ Submission Failed`,
    message: `${failed} test case(s) failed. Review and try again.`,
    submissionId: submission._id,
    priority: "normal",
    actionUrl: "/compiler",
    actionLabel: "View Failed Tests",
    metadata: { failed, submissionId: String(submission._id) },
  });
}

export async function notifySubmissionError(userId, submission, error) {
  return notifyStudent(userId, {
    type: "submission",
    title: `⚠️ Compilation Error`,
    message: "Your code failed to compile. Check the error details.",
    description: error || "See compiler output for details",
    submissionId: submission._id,
    priority: "normal",
    actionUrl: "/compiler",
    actionLabel: "Fix Code",
    metadata: { submissionId: String(submission._id) },
  });
}

/**
 * ACCOUNT NOTIFICATIONS
 */

export async function notifyAccountFreeze(userId, reason = "") {
  return notifyStudent(userId, {
    type: "account",
    title: `🚫 Account Frozen`,
    message: "Your account has been suspended by an administrator",
    description: reason || "No specific reason provided",
    priority: "critical",
    actionUrl: "/dashboard",
    actionLabel: "Contact Support",
    metadata: { frozen: true, reason },
  });
}

export async function notifyAccountUnfrozen(userId, reason = "") {
  return notifyStudent(userId, {
    type: "account",
    title: `✅ Account Unfrozen`,
    message: "Your account has been reactivated",
    description: reason || "Welcome back!",
    priority: "high",
    actionUrl: "/compiler",
    actionLabel: "Go to Compiler",
    metadata: { frozen: false },
  });
}

export async function notifyPasswordResetRequired(userId, reason = "") {
  return notifyStudent(userId, {
    type: "account",
    title: `🔐 Password Reset Required`,
    message: "You must reset your password before continuing",
    description:
      reason || "For security reasons, you need to update your password",
    priority: "critical",
    actionUrl: "/reset-password",
    actionLabel: "Reset Password",
    metadata: { requiresPasswordReset: true },
  });
}

/**
 * CERTIFICATE NOTIFICATIONS
 */

export async function notifyCertificateIssued(userId, certificate, eventTitle) {
  return notifyStudent(userId, {
    type: "certificate",
    title: `🏆 Certificate Issued`,
    message: `Your certificate for "${eventTitle}" has been generated`,
    certificateId: certificate._id,
    priority: "high",
    actionUrl: "/dashboard",
    actionLabel: "Download Certificate",
    metadata: { certificateNo: certificate.certificateNo },
  });
}

export async function notifyCertificateVerified(
  userId,
  certificate,
  verifierName = "",
) {
  return notifyStudent(userId, {
    type: "certificate",
    title: `✔️ Certificate Verified`,
    message: `Your certificate ${certificate.certificateNo} has been verified`,
    description: `Verified by: ${verifierName}`,
    certificateId: certificate._id,
    priority: "normal",
    actionUrl: "/dashboard",
    actionLabel: "View Certificate",
    metadata: { certificateNo: certificate.certificateNo },
  });
}

/**
 * PRIZE NOTIFICATIONS
 */

export async function notifyPrizeAllocated(userId, prize, eventTitle) {
  return notifyStudent(userId, {
    type: "submission",
    title: `🎁 Prize Allocated`,
    message: `You've been allocated "${prize.title}" for ${eventTitle}!`,
    priority: "high",
    actionUrl: "/dashboard#prizes",
    actionLabel: "Claim Prize",
    metadata: { prizeId: String(prize._id) },
  });
}

/**
 * ADMIN MESSAGES
 */

export async function sendAdminMessage(
  userId,
  subject,
  message,
  senderId,
  actionUrl = null,
) {
  return notifyStudent(userId, {
    type: "admin_message",
    title: subject,
    message,
    senderId,
    priority: "high",
    actionUrl,
    metadata: { fromAdmin: true },
  });
}

export async function broadcastAdminMessage(
  userIds,
  subject,
  message,
  senderId,
) {
  return notifyStudents(userIds, {
    type: "admin_message",
    title: subject,
    message,
    senderId,
    priority: "normal",
    metadata: { fromAdmin: true, broadcast: true },
  });
}

/**
 * SYSTEM NOTIFICATIONS
 */

export async function notifySystemAlert(
  userId,
  title,
  message,
  priority = "normal",
) {
  return notifyStudent(userId, {
    type: "system",
    title,
    message,
    priority,
    metadata: { system: true },
  });
}

export async function notifyMaintenance(
  userIds,
  startTime,
  endTime,
  reason = "",
) {
  const start = new Date(startTime).toLocaleString();
  const end = new Date(endTime).toLocaleString();

  return notifyStudents(userIds, {
    type: "system",
    title: `🔧 Scheduled Maintenance`,
    message: `System maintenance scheduled from ${start} to ${end}`,
    description: reason || "System will be temporarily unavailable",
    priority: "high",
    metadata: { maintenance: true, startTime, endTime },
  });
}

/**
 * UTILITY FUNCTIONS
 */

/**
 * Create custom notification (flexible)
 */
export async function createCustomNotification(userId, customPayload) {
  return notifyStudent(userId, customPayload);
}

/**
 * Create custom bulk notification
 */
export async function createCustomBulkNotification(userIds, customPayload) {
  return notifyStudents(userIds, customPayload);
}

/**
 * Get notification summary for a user
 */
export async function getNotificationSummary(userId) {
  const unreadCount = await Notification.countDocuments({
    userId,
    isRead: false,
    isArchived: false,
  });

  const critical = await Notification.countDocuments({
    userId,
    isRead: false,
    priority: "critical",
    isArchived: false,
  });

  const byType = await Notification.aggregate([
    {
      $match: { userId: new (require("mongoose").Types.ObjectId)(userId) },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    unreadCount,
    critical,
    byType: byType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
}

/**
 * Clean up old archived notifications (run periodically)
 */
export async function cleanupArchivedNotifications(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await Notification.deleteMany({
    isArchived: true,
    createdAt: { $lt: cutoffDate },
  });

  console.log(`Cleaned up ${result.deletedCount} old archived notifications`);
  return result;
}

export default {
  notifyStudent,
  notifyStudents,
  notifyEventCreated,
  notifyEventStarted,
  notifyEventEnded,
  notifyProblemReleased,
  notifyProblemUpdated,
  notifySubmissionPassed,
  notifySubmissionFailed,
  notifySubmissionError,
  notifyAccountFreeze,
  notifyAccountUnfrozen,
  notifyPasswordResetRequired,
  notifyCertificateIssued,
  notifyCertificateVerified,
  notifyPrizeAllocated,
  sendAdminMessage,
  broadcastAdminMessage,
  notifySystemAlert,
  notifyMaintenance,
  createCustomNotification,
  createCustomBulkNotification,
  getNotificationSummary,
  cleanupArchivedNotifications,
};
