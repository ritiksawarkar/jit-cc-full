import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { requestPasswordReset, resetPasswordWithToken } from "../services/api";

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const tokenFromUrl = String(searchParams.get("token") || "").trim();
    const emailFromUrl = String(searchParams.get("email") || "").trim().toLowerCase();

    const [requestEmail, setRequestEmail] = useState(emailFromUrl);
    const [requestError, setRequestError] = useState("");
    const [requestNotice, setRequestNotice] = useState("");
    const [requestResetUrl, setRequestResetUrl] = useState("");
    const [isRequesting, setIsRequesting] = useState(false);

    const [token, setToken] = useState(tokenFromUrl);
    const [email, setEmail] = useState(emailFromUrl);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetError, setResetError] = useState("");
    const [resetNotice, setResetNotice] = useState("");
    const [isResetting, setIsResetting] = useState(false);

    const hasToken = useMemo(() => token.length > 0, [token]);

    const handleRequestSubmit = async (event) => {
        event.preventDefault();
        const normalizedEmail = String(requestEmail || "").trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(normalizedEmail)) {
            setRequestError("Enter a valid email address.");
            return;
        }

        try {
            setIsRequesting(true);
            setRequestError("");
            setRequestNotice("");
            setRequestResetUrl("");

            const response = await requestPasswordReset(normalizedEmail);
            const emailed = Boolean(response?.delivery?.emailed);
            setRequestNotice(
                emailed
                    ? "Password reset email sent. Please check your inbox."
                    : response?.message ||
                    "If this account exists, a reset link has been generated.",
            );
            if (response?.reset?.resetUrl) {
                setRequestResetUrl(String(response.reset.resetUrl));
            }
        } catch (err) {
            setRequestError(
                err?.response?.data?.error ||
                err?.message ||
                "Unable to start password reset.",
            );
        } finally {
            setIsRequesting(false);
        }
    };

    const handleResetSubmit = async (event) => {
        event.preventDefault();

        if (!token) {
            setResetError("Reset token is required.");
            return;
        }

        if (newPassword.length < 6) {
            setResetError("Password must be at least 6 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setResetError("Password confirmation does not match.");
            return;
        }

        try {
            setIsResetting(true);
            setResetError("");
            setResetNotice("");
            const response = await resetPasswordWithToken({
                token,
                email: email || undefined,
                newPassword,
            });

            const role = String(response?.user?.role || "student").toLowerCase();
            const nextPath = role === "admin" ? "/admin/login" : "/compiler";
            setResetNotice("Password updated successfully. Redirecting to sign in...");
            window.setTimeout(() => {
                navigate(nextPath, { replace: true });
            }, 1100);
        } catch (err) {
            setResetError(
                err?.response?.data?.error || err?.message || "Unable to reset password.",
            );
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#06131a] px-4 py-10 text-white sm:px-8">
            <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200/85">
                        Account Recovery
                    </p>
                    <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                        Forgot Password
                    </h1>
                    <p className="mt-3 text-sm text-white/70 sm:text-base">
                        Enter your student or admin email to generate a secure reset link.
                    </p>

                    <form className="mt-7 space-y-4" onSubmit={handleRequestSubmit}>
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-white/80">Email</span>
                            <input
                                type="email"
                                value={requestEmail}
                                onChange={(event) => setRequestEmail(event.target.value)}
                                autoComplete="email"
                                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-cyan-300/55"
                                placeholder="you@example.com"
                            />
                        </label>

                        {requestError && (
                            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                {requestError}
                            </div>
                        )}

                        {requestNotice && (
                            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                                {requestNotice}
                            </div>
                        )}

                        {requestResetUrl && (
                            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                                <p className="font-medium">Reset link generated:</p>
                                <a
                                    href={requestResetUrl}
                                    className="mt-1 block break-all text-emerald-200 underline underline-offset-2"
                                >
                                    {requestResetUrl}
                                </a>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isRequesting}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isRequesting ? "Generating link..." : "Generate reset link"}
                        </button>
                    </form>
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#081017]/90 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200/90">
                        Reset Password
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                        Set New Password
                    </h2>
                    <p className="mt-3 text-sm text-white/70 sm:text-base">
                        Use the token from your reset link and set a fresh password.
                    </p>

                    <form className="mt-7 space-y-4" onSubmit={handleResetSubmit}>
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-white/80">Reset token</span>
                            <input
                                type="text"
                                value={token}
                                onChange={(event) => setToken(event.target.value.trim())}
                                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-emerald-300/55"
                                placeholder="Paste token from reset link"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-white/80">Email (optional)</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value.trim().toLowerCase())}
                                autoComplete="email"
                                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-emerald-300/55"
                                placeholder="you@example.com"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-white/80">New password</span>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                autoComplete="new-password"
                                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-emerald-300/55"
                                placeholder="At least 6 characters"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-white/80">Confirm password</span>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-emerald-300/55"
                                placeholder="Repeat new password"
                            />
                        </label>

                        {resetError && (
                            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                {resetError}
                            </div>
                        )}

                        {resetNotice && (
                            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                                {resetNotice}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isResetting || !hasToken}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isResetting ? "Updating password..." : "Reset password"}
                        </button>
                    </form>

                    <div className="mt-6 text-sm text-white/70">
                        <Link
                            to="/compiler"
                            className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100"
                        >
                            Back to compiler
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
