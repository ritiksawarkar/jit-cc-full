import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "../components/ToastProvider";
import { getNotificationSummary, getMyNotifications } from "../services/api";

/**
 * useNotifications - Custom hook for real-time notifications
 * Features:
 * - Auto-polling notifications at regular intervals
 * - Real-time badge updates
 * - Notification grouping by type
 * - Unread count tracking
 */
export function useNotifications(pollingInterval = 10000) {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({
    unreadCount: 0,
    critical: 0,
    unreadByType: {},
    lastPinned: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const pollingTimerRef = useRef(null);

  // Fetch notification summary
  const fetchNotificationSummary = useCallback(async () => {
    try {
      const data = await getNotificationSummary();
      setSummary(data);

      // Show toast for new critical notifications
      if (data.critical > 0) {
        // Only show if there are unread critical
        if (data.critical > summary.critical) {
          showToast({
            type: "error",
            message: `🚨 You have ${data.critical} critical notification(s)!`,
          });
        }
      }
    } catch (err) {
      console.error("Error fetching notification summary:", err);
      setError("Unable to fetch notifications");
    }
  }, [summary.critical, showToast]);

  // Fetch detailed notifications
  const fetchNotifications = useCallback(async (options = {}) => {
    setIsLoading(true);
    try {
      const data = await getMyNotifications(
        options.type,
        options.isRead,
        options.priority,
      );
      setNotifications(data.notifications || []);
      setError("");
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError("Unable to fetch notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start auto-polling
  useEffect(() => {
    // Fetch immediately
    fetchNotificationSummary();
    fetchNotifications(); // Fetch detailed notifications

    // Set up polling interval
    pollingTimerRef.current = setInterval(() => {
      fetchNotificationSummary();
      fetchNotifications(); // Also fetch detailed notifications
    }, pollingInterval);

    // Cleanup
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [pollingInterval, fetchNotificationSummary, fetchNotifications]);

  // Get unread count for a specific type
  const getUnreadCountByType = useCallback(
    (type) => {
      return summary.unreadByType?.[type] || 0;
    },
    [summary.unreadByType],
  );

  // Get notifications by type
  const getNotificationsByType = useCallback(
    (type) => {
      return notifications.filter((n) => n.type === type);
    },
    [notifications],
  );

  // Get critical notifications
  const getCriticalNotifications = useCallback(() => {
    return notifications.filter((n) => n.priority === "critical" && !n.isRead);
  }, [notifications]);

  // Get pinned notifications
  const getPinnedNotifications = useCallback(() => {
    return notifications.filter((n) => n.isPinned && !n.isArchived);
  }, [notifications]);

  return {
    notifications,
    summary,
    isLoading,
    error,
    fetchNotifications,
    fetchNotificationSummary,
    getUnreadCountByType,
    getNotificationsByType,
    getCriticalNotifications,
    getPinnedNotifications,
  };
}
