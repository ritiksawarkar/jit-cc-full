import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    AlertCircle,
    Clock,
    CheckCircle,
    MessageSquare,
    FileText,
    Award,
} from "lucide-react";

function getRelativeTimeLabel(value) {
    if (!value) return "Just now";
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return "Just now";

    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

function getNotificationMeta(type) {
    switch (type) {
        case "critical":
            return {
                icon: <AlertCircle size={16} className="text-red-300" />,
                iconWrap: "bg-red-500/20 border-red-400/30",
            };
        case "event":
            return {
                icon: <Clock size={16} className="text-cyan-300" />,
                iconWrap: "bg-cyan-500/20 border-cyan-400/30",
            };
        case "submission":
            return {
                icon: <CheckCircle size={16} className="text-rose-300" />,
                iconWrap: "bg-rose-500/20 border-rose-400/30",
            };
        case "admin_message":
            return {
                icon: <MessageSquare size={16} className="text-violet-300" />,
                iconWrap: "bg-violet-500/20 border-violet-400/30",
            };
        case "problem":
            return {
                icon: <FileText size={16} className="text-yellow-300" />,
                iconWrap: "bg-yellow-500/20 border-yellow-400/30",
            };
        case "certificate":
            return {
                icon: <Award size={16} className="text-amber-300" />,
                iconWrap: "bg-amber-500/20 border-amber-400/30",
            };
        default:
            return {
                icon: <Bell size={16} className="text-slate-300" />,
                iconWrap: "bg-slate-500/20 border-slate-400/30",
            };
    }
}

function cleanNotificationText(value, fallback = "") {
    const raw = String(value || fallback || "");
    return raw
        .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, "")
        .trim();
}

export default function NotificationBadge() {
    const navigate = useNavigate();
    const { summary, notifications, fetchNotifications } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);

    const unreadCount = summary.unreadCount || 0;
    const criticalCount = summary.critical || 0;

    const visibleNotifications = useMemo(
        () => notifications || [],
        [notifications],
    );

    // Handle button click - fetch fresh data and toggle dropdown
    const handleClick = async () => {
        if (!isOpen) {
            // When opening, fetch fresh notifications
            await fetchNotifications();
        }
        setIsOpen(!isOpen);
    };

    if (unreadCount === 0 && criticalCount === 0) {
        return (
            <button
                onClick={handleClick}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Notifications"
            >
                <Bell size={20} />
            </button>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={handleClick}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
                    >
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </motion.div>
                )}

                {criticalCount > 0 && (
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 rounded-lg border border-red-500/50"
                    />
                )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute right-0 top-12 z-50 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 via-gray-950/95 to-black/95 backdrop-blur-xl shadow-2xl"
                    >
                        {/* Header */}
                        <div className="border-b border-white/10 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 p-1.5">
                                    <Bell size={16} className="text-cyan-300" />
                                </div>
                                <h3 className="text-sm font-bold tracking-wide text-white">
                                    Notifications {unreadCount > 0 && `(${unreadCount})`}
                                </h3>
                            </div>
                            {criticalCount > 0 && (
                                <div className="flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-200">
                                    <AlertCircle size={12} />
                                    {criticalCount} Critical
                                </div>
                            )}
                        </div>

                        {/* Notifications list */}
                        <div className="max-h-[70vh] space-y-2 overflow-y-auto px-3 py-3">
                            {visibleNotifications.length === 0 ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/60">
                                    No notifications yet.
                                </div>
                            ) : visibleNotifications.map((notification) => (
                                <motion.button
                                    key={notification.id || notification._id || notification.createdAt || notification.title}
                                    onClick={() => {
                                        if (notification.actionUrl) {
                                            navigate(notification.actionUrl);
                                            setIsOpen(false);
                                        }
                                    }}
                                    whileHover={{ scale: 1.01 }}
                                    className={`group w-full rounded-xl border p-3 text-left transition-all ${!notification.isRead
                                        ? "border-cyan-400/35 bg-cyan-500/10"
                                        : "border-white/10 bg-white/[0.04]"
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`mt-0.5 rounded-lg border p-1.5 ${getNotificationMeta(notification.type).iconWrap}`}
                                        >
                                            {getNotificationMeta(notification.type).icon}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <p className="truncate text-sm font-semibold text-white">
                                                    {cleanNotificationText(notification.title, "Notification")}
                                                </p>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {!notification.isRead ? (
                                                        <span className="h-2 w-2 rounded-full bg-cyan-300" />
                                                    ) : null}
                                                    <p className="text-[11px] text-white/45">
                                                        {getRelativeTimeLabel(notification.createdAt || notification.updatedAt)}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="line-clamp-2 text-xs text-white/70">
                                                {cleanNotificationText(notification.message, "No details available.")}
                                            </p>
                                        </div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-white/10 px-3 py-3">
                            <button
                                onClick={() => {
                                    navigate("/notifications");
                                    setIsOpen(false);
                                }}
                                className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2.5 text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                            >
                                View All {unreadCount > 0 ? `(${unreadCount})` : ""} →
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Backdrop to close dropdown */}
            {isOpen && (
                <button
                    onClick={() => setIsOpen(false)}
                    className="fixed inset-0 z-40"
                />
            )}
        </div>
    );
}
