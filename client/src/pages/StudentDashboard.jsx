import React from "react";
import { Link } from "react-router-dom";
import { useCompilerStore } from "../store/useCompilerStore";

export default function StudentDashboard() {
    const currentUser = useCompilerStore((s) => s.currentUser);

    return (
        <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-4xl rounded-2xl border border-cyan-500/20 bg-black/40 p-6">
                <h1 className="text-2xl font-bold">Student Dashboard</h1>
                <p className="mt-2 text-sm text-white/70">
                    Welcome {currentUser?.name || "Student"}. Access the compiler and track your practice.
                </p>

                <div className="mt-6">
                    <Link
                        to="/compiler"
                        className="inline-flex min-h-10 items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black"
                    >
                        Go To Compiler
                    </Link>
                </div>
            </div>
        </div>
    );
}
