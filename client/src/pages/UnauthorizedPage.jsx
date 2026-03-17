import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useCompilerStore } from "../store/useCompilerStore";

export default function UnauthorizedPage() {
    const location = useLocation();
    const currentUser = useCompilerStore((state) => state.currentUser);
    const role = String(currentUser?.role || "guest").toLowerCase();

    const attemptedPath = useMemo(() => {
        const path = location.state?.from?.pathname;
        return typeof path === "string" ? path : null;
    }, [location.state]);

    const reason = useMemo(() => {
        const rawReason = location.state?.reason;
        return typeof rawReason === "string" && rawReason.trim()
            ? rawReason
            : "Your current account does not have permission to view that page.";
    }, [location.state]);

    const recoveryPath = role === "admin" ? "/admin/dashboard" : "/compiler";
    const recoveryLabel = role === "admin" ? "Go to admin dashboard" : "Return to compiler";

    return (
        <div className="min-h-screen bg-[#120b12] px-4 py-10 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.16),transparent_34%)]" />

            <div className="relative mx-auto max-w-3xl rounded-[32px] border border-white/10 bg-black/45 p-6 shadow-[0_30px_140px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-amber-200">
                    <ShieldAlert size={14} />
                    Access denied
                </div>

                <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    Unauthorized
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                    {reason}
                </p>

                {attemptedPath && (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/45">Attempted route</p>
                        <p className="mt-2 break-all font-mono text-sm text-white/85">{attemptedPath}</p>
                    </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                        to={recoveryPath}
                        className="inline-flex min-h-11 items-center rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-200"
                    >
                        {recoveryLabel}
                    </Link>
                    <Link
                        to="/admin/login"
                        className="inline-flex min-h-11 items-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                        Admin login
                    </Link>
                </div>
            </div>
        </div>
    );
}