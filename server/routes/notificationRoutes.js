import express from "express";
import {
  getMyNotifications,
  getNotificationSummary,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  archiveNotification,
  archiveAllReadNotifications,
  deleteNotification,
  pinNotification,
  createNotification,
  getAllNotifications,
} from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ========== STUDENT ROUTES ==========

/**
 * GET /api/notifications
 * Get all notifications for the logged-in student
 */
router.get("/", requireAuth, getMyNotifications);

/**
 * GET /api/notifications/summary
 * Get notification summary (unread count, critical count, etc.)
 */
router.get("/summary", requireAuth, getNotificationSummary);

/**
 * PUT /api/notifications/:notificationId/read
 * Mark single notification as read
 */
router.put("/:notificationId/read", requireAuth, markNotificationAsRead);

/**
 * PUT /api/notifications/read-all
 * Mark multiple notifications as read
 */
router.put("/read-all", requireAuth, markAllNotificationsAsRead);

/**
 * PUT /api/notifications/:notificationId/archive
 * Archive a notification
 */
router.put("/:notificationId/archive", requireAuth, archiveNotification);

/**
 * PUT /api/notifications/archive-all
 * Archive all read notifications
 */
router.put("/archive-all", requireAuth, archiveAllReadNotifications);

/**
 * DELETE /api/notifications/:notificationId
 * Delete a notification
 */
router.delete("/:notificationId", requireAuth, deleteNotification);

/**
 * PUT /api/notifications/:notificationId/pin
 * Pin a notification
 */
router.put("/:notificationId/pin", requireAuth, pinNotification);

// ========== ADMIN ROUTES ==========

/**
 * POST /api/notifications/create
 * Admin: Create and send notifications to student(s)
 */
router.post("/create", requireAuth, requireRole("admin"), createNotification);

/**
 * GET /api/notifications/admin/all
 * Admin: Get all notifications (debugging/monitoring)
 */
router.get(
  "/admin/all",
  requireAuth,
  requireRole("admin"),
  getAllNotifications,
);

export default router;
