import React, { useState } from "react";
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

export default function NotificationBadge() {
    const navigate = useNavigate();
    const { summary, notifications, fetchNotifications } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);

    const unreadCount = summary.unreadCount || 0;
    const criticalCount = summary.critical || 0;

    // Get recent critical notifications
    const criticalNotifs = notifications
        .filter((n) => n.priority === "critical" && !n.isRead)
        .slice(0, 3);

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
                className="relative rounded-lg border border-white/15 bg-white/5 p-2 text-white/85 hover:bg-white/10 hover:text-white transition-colors"
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
                className="relative rounded-lg border border-white/15 bg-white/5 p-2 text-white/85 hover:bg-white/10 hover:text-white transition-colors"
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
                        className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-white/10 bg-gradient-to-b from-gray-900/95 to-black/95 p-4 backdrop-blur-xl shadow-2xl"
                    >
                        {/* Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell size={20} className="text-cyan-400" />
                                <h3 className="font-bold text-white">
                                    Notifications {unreadCount > 0 && `(${unreadCount})`}
                                </h3>
                            </div>
                            {criticalCount > 0 && (
                                <div className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200">
                                    <AlertCircle size={12} />
                                    {criticalCount} Critical
                                </div>
                            )}
                        </div>

                        {/* Notifications list */}
                        <div className="max-h-96 space-y-2 overflow-y-auto">
                            {notifications.slice(0, 5).map((notification) => (
                                <motion.button
                                    key={notification.id}
                                    onClick={() => {
                                        if (notification.actionUrl) {
                                            navigate(notification.actionUrl);
                                            setIsOpen(false);
                                        }
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    className={`w-full rounded-lg border p-3 text-left transition-all ${!notification.isRead
                                        ? "border-cyan-500/30 bg-cyan-500/10"
                                        : "border-white/10 bg-white/5 opacity-70"
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1">
                                            {notification.type === "critical" && (
                                                <AlertCircle size={16} className="text-red-400" />
                                            )}
                                            {notification.type === "event" && (
                                                <Clock size={16} className="text-cyan-400" />
                                            )}
                                            {notification.type === "submission" && (
                                                <CheckCircle size={16} className="text-emerald-400" />
                                            )}
                                            {notification.type === "admin_message" && (
                                                <MessageSquare
                                                    size={16}
                                                    className="text-purple-400"
                                                />
                                            )}
                                            {notification.type === "problem" && (
                                                <FileText size={16} className="text-yellow-400" />
                                            )}
                                            {notification.type === "certificate" && (
                                                <Award size={16} className="text-amber-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-white text-sm truncate">
                                                {notification.title}
                                            </p>
                                            <p className="text-xs text-gray-400 line-clamp-2">
                                                {notification.message}
                                            </p>
                                        </div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>

                        {/* Footer */}
                        <button
                            onClick={() => {
                                navigate("/notifications");
                                setIsOpen(false);
                            }}
                            className="mt-4 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-all"
                        >
                            View All →
                        </button>
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
