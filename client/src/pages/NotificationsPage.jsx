import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import {
    markNotificationAsRead,
    markAllNotificationsAsRead,
    archiveNotification,
    archiveAllReadNotifications,
    deleteNotification,
} from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    Filter,
    Trash2,
    Archive,
    Check,
    AlertCircle,
    Info,
    CheckCircle2,
    AlertTriangle,
    MessageSquare,
    FileText,
    Award,
    Clock,
} from "lucide-react";

const NOTIFICATION_ICONS = {
    system: <Info size={20} className="text-blue-400" />,
    event: <Clock size={20} className="text-cyan-400" />,
    account: <AlertTriangle size={20} className="text-red-400" />,
    submission: <CheckCircle2 size={20} className="text-emerald-400" />,
    admin_message: <MessageSquare size={20} className="text-purple-400" />,
    problem: <FileText size={20} className="text-yellow-400" />,
    certificate: <Award size={20} className="text-amber-400" />,
};

export default function NotificationsPage() {
    const navigate = useNavigate();
    const { notifications, summary, isLoading, fetchNotifications } =
        useNotifications();

    const [filter, setFilter] = useState("all"); // all, unread, critical, event, account, submission
    const [sortBy, setSortBy] = useState("newest"); // newest, oldest, unread-first
    const [filteredNotifications, setFilteredNotifications] = useState([]);
    const [selectedCount, setSelectedCount] = useState(0);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isActioning, setIsActioning] = useState(false);

    // Apply filters and sorting
    useEffect(() => {
        let filtered = notifications;

        // Filter by type
        if (filter === "unread") {
            filtered = filtered.filter((n) => !n.isRead);
        } else if (filter === "critical") {
            filtered = filtered.filter((n) => n.priority === "critical");
        } else if (filter !== "all") {
            filtered = filtered.filter((n) => n.type === filter);
        }

        // Sort
        if (sortBy === "oldest") {
            filtered = filtered.reverse();
        } else if (sortBy === "unread-first") {
            filtered.sort((a, b) => {
                if (a.isRead === b.isRead) return 0;
                return a.isRead ? 1 : -1;
            });
        }

        setFilteredNotifications(filtered);
    }, [notifications, filter, sortBy]);

    const handleSelectAll = () => {
        if (selectedCount === filteredNotifications.length) {
            setSelectedIds(new Set());
            setSelectedCount(0);
        } else {
            setSelectedIds(
                new Set(filteredNotifications.map((n) => n.id))
            );
            setSelectedCount(filteredNotifications.length);
        }
    };

    const handleToggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
        setSelectedCount(newSet.size);
    };

    const handleMarkAsReadBulk = async () => {
        if (selectedIds.size === 0) return;

        setIsActioning(true);
        try {
            await markAllNotificationsAsRead(Array.from(selectedIds));
            await fetchNotifications();
            setSelectedIds(new Set());
            setSelectedCount(0);
        } catch (err) {
            console.error("Error marking as read:", err);
        } finally {
            setIsActioning(false);
        }
    };

    const handleArchiveBulk = async () => {
        if (selectedIds.size === 0) return;

        setIsActioning(true);
        try {
            for (const id of selectedIds) {
                await archiveNotification(id);
            }
            await fetchNotifications();
            setSelectedIds(new Set());
            setSelectedCount(0);
        } catch (err) {
            console.error("Error archiving:", err);
        } finally {
            setIsActioning(false);
        }
    };

    const handleMarkAllAsRead = async () => {
        setIsActioning(true);
        try {
            const unreadIds = notifications
                .filter((n) => !n.isRead)
                .map((n) => n.id);

            if (unreadIds.length > 0) {
                await markAllNotificationsAsRead(unreadIds);
                await fetchNotifications();
            }
        } catch (err) {
            console.error("Error marking all as read:", err);
        } finally {
            setIsActioning(false);
        }
    };

    const handleArchiveAllRead = async () => {
        setIsActioning(true);
        try {
            await archiveAllReadNotifications();
            await fetchNotifications();
        } catch (err) {
            console.error("Error archiving read:", err);
        } finally {
            setIsActioning(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-950 to-black px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-3">
                            <Bell size={32} className="text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white lg:text-4xl">
                                Notifications
                            </h1>
                            <p className="text-sm text-gray-400">
                                {summary.unreadCount} unread
                                {summary.critical > 0 &&
                                    ` • ${summary.critical} critical`}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate("/dashboard")}
                        className="hidden rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-all md:inline-block"
                    >
                        ← Back to Dashboard
                    </button>
                </div>

                {/* Controls */}
                <div className="mb-6 space-y-4 rounded-xl border border-white/10 bg-black/40 p-4 sm:p-6">
                    {/* Filters and actions */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-2">
                            {["all", "unread", "critical", "event", "account", "submission"].map(
                                (f) => (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${filter === f
                                            ? "bg-cyan-600 text-white"
                                            : "border border-white/20 text-white/70 hover:bg-white/10"
                                            }`}
                                    >
                                        {f.charAt(0).toUpperCase() +
                                            f.slice(1).replace("_", " ")}
                                    </button>
                                )
                            )}
                        </div>

                        {/* Sort */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm font-semibold text-white outline-none transition-colors focus:border-cyan-500/50 focus:bg-white/10"
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="unread-first">Unread First</option>
                        </select>
                    </div>

                    {/* Bulk actions */}
                    {(summary.unreadCount > 0 ||
                        notifications.some((n) => n.isRead)) && (
                            <div className="border-t border-white/10 pt-4">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={handleMarkAllAsRead}
                                        disabled={isActioning || summary.unreadCount === 0}
                                        className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs sm:text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50 transition-all"
                                    >
                                        <Check size={16} />
                                        Mark All as Read
                                    </button>

                                    <button
                                        onClick={handleArchiveAllRead}
                                        disabled={isActioning}
                                        className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs sm:text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50 transition-all"
                                    >
                                        <Archive size={16} />
                                        Archive Read
                                    </button>
                                </div>
                            </div>
                        )}
                </div>

                {/* Selection controls */}
                {selectedCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 flex items-center justify-between gap-4"
                    >
                        <div className="text-sm font-semibold text-cyan-200">
                            {selectedCount} selected
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleMarkAsReadBulk}
                                disabled={isActioning}
                                className="flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 transition-all"
                            >
                                <Check size={16} />
                                Mark Read
                            </button>

                            <button
                                onClick={handleArchiveBulk}
                                disabled={isActioning}
                                className="flex items-center gap-2 rounded-lg border border-cyan-500/50 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 transition-all"
                            >
                                <Archive size={16} />
                                Archive
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Notifications list */}
                {isLoading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="h-20 animate-pulse rounded-lg bg-white/10"
                            />
                        ))}
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/40 py-16 text-center">
                        <Bell size={48} className="mx-auto mb-4 text-white/20" />
                        <p className="text-lg text-white/60">No notifications</p>
                        <p className="text-sm text-white/40">
                            {filter === "all"
                                ? "You're all caught up!"
                                : `No ${filter} notifications`}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {filteredNotifications.map((notification) => (
                                <motion.div
                                    key={notification.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className={`group relative rounded-xl border p-4 sm:p-6 transition-all ${!notification.isRead
                                        ? "border-cyan-500/30 bg-cyan-500/10 ring-1 ring-cyan-500/20"
                                        : "border-white/10 bg-white/5"
                                        }`}
                                >
                                    {/* Checkbox */}
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(notification.id)}
                                        onChange={() => handleToggleSelect(notification.id)}
                                        className="absolute left-4 top-4 sm:top-6"
                                    />

                                    {/* Content with margin for checkbox */}
                                    <div className="ml-8 flex gap-4">
                                        {/* Icon */}
                                        <div className="mt-1 shrink-0">
                                            {NOTIFICATION_ICONS[notification.type]}
                                        </div>

                                        {/* Main content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-lg font-semibold text-white">
                                                            {notification.title}
                                                        </h3>
                                                        {notification.priority === "critical" && (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-200">
                                                                <AlertCircle size={12} />
                                                                CRITICAL
                                                            </span>
                                                        )}
                                                        {!notification.isRead && (
                                                            <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                                                        )}
                                                    </div>

                                                    <p className="mt-2 text-base text-gray-300">
                                                        {notification.message}
                                                    </p>

                                                    {notification.description && (
                                                        <p className="mt-2 text-sm text-gray-400">
                                                            {notification.description}
                                                        </p>
                                                    )}

                                                    {/* Action button */}
                                                    {notification.actionLabel &&
                                                        notification.actionUrl && (
                                                            <button
                                                                onClick={() =>
                                                                    navigate(notification.actionUrl)
                                                                }
                                                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600/30 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-600/50 transition-all"
                                                            >
                                                                {notification.actionLabel} →
                                                            </button>
                                                        )}

                                                    {/* Metadata */}
                                                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                                                        <div>
                                                            Type:{" "}
                                                            <span className="text-cyan-400">
                                                                {notification.type}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            Priority:{" "}
                                                            <span className="text-yellow-400">
                                                                {notification.priority}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            {new Date(
                                                                notification.createdAt
                                                            ).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
