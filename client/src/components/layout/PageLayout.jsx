import React from "react";

/**
 * PageLayout - Reusable container for consistent app-wide layout
 * Features:
 * - Max-width constraints (max-w-7xl)
 * - Responsive horizontal padding
 * - Dark theme with glass effect
 * - Consistent spacing
 */
export function PageContainer({ children, className = "" }) {
    return (
        <div className={`mx-auto max-w-7xl px-3 sm:px-4 md:px-6 lg:px-6 ${className}`}>
            {children}
        </div>
    );
}

/**
 * PageHeader - Consistent header for pages
 */
export function PageHeader({ title, subtitle, className = "" }) {
    return (
        <div className={`space-y-1.5 pb-4 ${className}`}>
            <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">
                {title}
            </h1>
            {subtitle && <p className="text-base text-gray-400">{subtitle}</p>}
        </div>
    );
}

/**
 * SectionCard - Reusable card component for sections
 */
export function SectionCard({
    title,
    subtitle,
    children,
    className = "",
    border = true
}) {
    return (
        <div
            className={`space-y-3 sm:space-y-4 rounded-2xl bg-black/40 p-4 sm:p-5 md:p-6 lg:p-6 ${border ? "border border-cyan-500/20" : ""
                } ${className}`}
        >
            {title && (
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-white lg:text-2xl">
                        {title}
                    </h2>
                    {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
                </div>
            )}
            {children}
        </div>
    );
}

/**
 * ContentGrid - Responsive grid for cards/items
 */
export function ContentGrid({
    children,
    cols = 1,
    className = ""
}) {
    const gridCols = {
        1: "grid-cols-1",
        2: "md:grid-cols-2",
        3: "lg:grid-cols-3",
    };

    return (
        <div className={`grid gap-3 sm:gap-4 ${gridCols[cols]} ${className}`}>
            {children}
        </div>
    );
}

/**
 * ResponsiveTable - Wrapper for tables with proper overflow handling
 */
export function ResponsiveTable({ children, className = "" }) {
    return (
        <div className={`overflow-x-auto rounded-xl border border-white/10 shadow-sm ${className}`}>
            <div className="inline-block min-w-full align-middle">
                {children}
            </div>
        </div>
    );
}

/**
 * Alert - Reusable alert component
 */
export function Alert({
    type = "info", // info, error, success
    title,
    message,
    onClose,
    className = "",
}) {
    const typeStyles = {
        error: "border-red-500/30 bg-red-500/10 text-red-100",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        info: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    };

    return (
        <div
            className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 text-sm ${typeStyles[type]} ${className}`}
        >
            <div className="space-y-1">
                {title && <p className="font-semibold">{title}</p>}
                {message && <p className="opacity-90">{message}</p>}
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className="mt-0.5 flex-shrink-0 text-lg opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Close"
                >
                    ×
                </button>
            )}
        </div>
    );
}

/**
 * Button - Consistent button styling
 */
export function Button({
    children,
    variant = "primary", // primary, secondary, ghost
    size = "base", // sm, base, lg
    disabled = false,
    className = "",
    ...props
}) {
    const buttonVariants = {
        primary: "bg-gradient-to-r from-cyan-600 to-cyan-500 text-black font-semibold hover:from-cyan-500 hover:to-cyan-400 disabled:from-cyan-600/50 disabled:to-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all",
        secondary: "border border-white/20 text-white bg-white/5 hover:bg-white/10 hover:border-white/40 disabled:bg-white/5 disabled:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all",
        ghost: "border border-white/10 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all",
    };

    const buttonSizes = {
        sm: "px-2.5 py-1 text-xs rounded-md",
        base: "px-3 py-1.5 text-sm rounded-lg",
        lg: "px-5 py-2.5 text-base rounded-lg",
    };

    return (
        <button
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-2 align-middle leading-none font-semibold transition-all ${buttonVariants[variant]} ${buttonSizes[size]} ${disabled ? "cursor-not-allowed" : "cursor-pointer"
                } ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
