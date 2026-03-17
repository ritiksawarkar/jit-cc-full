import React from "react";
import { Link } from "react-router-dom";
import { useCompilerStore } from "../store/useCompilerStore";

export default function AdminDashboard() {
    const currentUser = useCompilerStore((s) => s.currentUser);

    return (
        <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-5xl rounded-2xl border border-cyan-500/20 bg-black/40 p-6">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="mt-2 text-sm text-white/70">
                    Logged in as {currentUser?.name || "Admin"} ({currentUser?.email})
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <h2 className="text-lg font-semibold">Submission Oversight</h2>
                        <p className="mt-1 text-sm text-white/70">
                            Review all submissions, monitor verdict trends, and audit contest behavior.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <h2 className="text-lg font-semibold">User Control</h2>
                        <p className="mt-1 text-sm text-white/70">
                            Manage student accounts, elevate roles manually, and enforce access policy.
                        </p>
                    </div>
                </div>

                <div className="mt-6">
                    <Link
                        to="/compiler"
                        className="inline-flex min-h-10 items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black"
                    >
                        Open Compiler
                    </Link>
                </div>
            </div>
        </div>
    );
}
