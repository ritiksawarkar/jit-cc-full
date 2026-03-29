import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import {
    markNotificationAsRead,
    archiveNotification,
    deleteNotification,
    pinNotification,
} from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    Archive,
    Trash2,
    Pin,
    X,
    AlertCircle,
    Info,
    CheckCircle,
    AlertTriangle,
    MessageSquare,
    FileText,
    Award,
    Clock,
} from "lucide-react";

const NOTIFICATION_ICONS = {
    system: <Info size={18} className="text-blue-400" />,
    event: <Clock size={18} className="text-cyan-400" />,
    account: <AlertTriangle size={18} className="text-red-400" />,
    submission: <CheckCircle size={18} className="text-emerald-400" />,
    admin_message: <MessageSquare size={18} className="text-purple-400" />,
    problem: <FileText size={18} className="text-yellow-400" />,
    certificate: <Award size={18} className="text-amber-400" />,
};

const NOTIFICATION_COLORS = {
    critical: "border-red-500/30 bg-red-500/10",
    high: "border-orange-500/30 bg-orange-500/10",
    normal: "border-white/10 bg-white/5",
    low: "border-gray-500/30 bg-gray-500/10",
};

export default function NotificationCenter() {
    const navigate = useNavigate();
    const { notifications, isLoading } = useNotifications();
    const [filter, setFilter] = useState("all"); // all, unread, critical
    const [filteredNotifications, setFilteredNotifications] = useState([]);
    const [actioningId, setActioningId] = useState(null);

    // Filter notifications
    useEffect(() => {
        let filtered = notifications;

        if (filter === "unread") {
            filtered = notifications.filter((n) => !n.isRead && !n.isArchived);
        } else if (filter === "critical") {
            filtered = notifications.filter(
                (n) => n.priority === "critical" && !n.isRead
            );
        } else {
            filtered = notifications.filter((n) => !n.isArchived);
        }

        setFilteredNotifications(filtered.slice(0, 20)); // Limit to 20
    }, [notifications, filter]);

    // Handle mark as read
    const handleMarkAsRead = async (notificationId, e) => {
        e.stopPropagation();
        setActioningId(notificationId);
        try {
            await markNotificationAsRead(notificationId);
            setActioningId(null);
        } catch (err) {
            console.error("Error marking as read:", err);
            setActioningId(null);
        }
    };

    // Handle archive
    const handleArchive = async (notificationId, e) => {
        e.stopPropagation();
        setActioningId(notificationId);
        try {
            await archiveNotification(notificationId);
            setActioningId(null);
        } catch (err) {
            console.error("Error archiving:", err);
            setActioningId(null);
        }
    };

    // Handle delete
    const handleDelete = async (notificationId, e) => {
        e.stopPropagation();
        setActioningId(notificationId);
        try {
            await deleteNotification(notificationId);
            setActioningId(null);
        } catch (err) {
            console.error("Error deleting:", err);
            setActioningId(null);
        }
    };

    // Handle pin
    const handlePin = async (notificationId, e) => {
        e.stopPropagation();
        setActioningId(notificationId);
        try {
            await pinNotification(notificationId);
            setActioningId(null);
        } catch (err) {
            console.error("Error pinning:", err);
            setActioningId(null);
        }
    };

    // Handle notification click
    const handleNotificationClick = (notification) => {
        if (!notification.isRead) {
            handleMarkAsRead(notification.id, { stopPropagation: () => { } });
        }

        if (notification.actionUrl) {
            navigate(notification.actionUrl);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="h-16 animate-pulse rounded-lg bg-white/10"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl mx-auto rounded-xl border border-white/10 bg-black/40 p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <Bell size={24} className="text-cyan-400" />
                    <h2 className="text-2xl font-bold text-white">Notifications</h2>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
                {["all", "unread", "critical"].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${filter === f
                                ? "bg-cyan-600 text-white"
                                : "border border-white/20 text-white/70 hover:bg-white/10"
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Notifications List */}
            {filteredNotifications.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 py-12 text-center">
                    <Bell size={32} className="mx-auto mb-3 text-white/40" />
                    <p className="text-white/60">
                        {filter === "all"
                            ? "No notifications yet"
                            : `No ${filter} notifications`}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {filteredNotifications.map((notification) => (
                            <motion.div
                                key={notification.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                onClick={() => handleNotificationClick(notification)}
                                className={`group relative cursor-pointer rounded-lg border transition-all ${NOTIFICATION_COLORS[notification.priority]
                                    } ${!notification.isRead
                                        ? "ring-1 ring-cyan-500/50"
                                        : "opacity-75"
                                    } p-4 hover:ring-1 hover:ring-cyan-500/50`}
                            >
                                {/* Unread indicator */}
                                {!notification.isRead && (
                                    <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-gradient-to-b from-cyan-500 to-cyan-600" />
                                )}

                                <div className="flex gap-4">
                                    {/* Icon */}
                                    <div className="mt-1 shrink-0">
                                        {NOTIFICATION_ICONS[notification.type] || <Bell size={18} />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-white">
                                            {notification.title}
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-300">
                                            {notification.message}
                                        </p>
                                        {notification.description && (
                                            <p className="mt-2 text-xs text-gray-400 line-clamp-2">
                                                {notification.description}
                                            </p>
                                        )}

                                        {/* Action button */}
                                        {notification.actionLabel && notification.actionUrl && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(notification.actionUrl);
                                                }}
                                                className="mt-2 inline-flex items-center gap-2 rounded-md bg-cyan-600/30 px-3 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/50 transition-all"
                                            >
                                                {notification.actionLabel} →
                                            </button>
                                        )}

                                        {/* Timestamp */}
                                        <div className="mt-2 text-xs text-gray-500">
                                            {new Date(notification.createdAt).toLocaleString()}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex shrink-0 gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                        {!notification.isRead && (
                                            <button
                                                onClick={(e) => handleMarkAsRead(notification.id, e)}
                                                disabled={actioningId === notification.id}
                                                className="rounded-md bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50 transition-colors"
                                                title="Mark as read"
                                            >
                                                <CheckCircle size={16} />
                                            </button>
                                        )}

                                        <button
                                            onClick={(e) => handlePin(notification.id, e)}
                                            disabled={actioningId === notification.id}
                                            className="rounded-md bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50 transition-colors"
                                            title={notification.isPinned ? "Unpin" : "Pin"}
                                        >
                                            <Pin
                                                size={16}
                                                className={
                                                    notification.isPinned ? "fill-current" : ""
                                                }
                                            />
                                        </button>

                                        <button
                                            onClick={(e) => handleArchive(notification.id, e)}
                                            disabled={actioningId === notification.id}
                                            className="rounded-md bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50 transition-colors"
                                            title="Archive"
                                        >
                                            <Archive size={16} />
                                        </button>

                                        <button
                                            onClick={(e) => handleDelete(notification.id, e)}
                                            disabled={actioningId === notification.id}
                                            className="rounded-md bg-red-500/10 p-2 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} className="text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* View all link */}
            {filteredNotifications.length > 0 && (
                <button
                    onClick={() => navigate("/notifications")}
                    className="mt-6 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-3 font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-all"
                >
                    View All Notifications →
                </button>
            )}
        </div>
    );
}
