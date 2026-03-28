import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { loginWithEmail, requestPasswordReset } from "../services/api";
import { useCompilerStore } from "../store/useCompilerStore";

export default function AdminLoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = useCompilerStore((state) => state.currentUser);
    const setAuthSession = useCompilerStore((state) => state.setAuthSession);
    const logout = useCompilerStore((state) => state.logout);
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotError, setForgotError] = useState("");
    const [forgotNotice, setForgotNotice] = useState("");
    const [forgotResetUrl, setForgotResetUrl] = useState("");
    const [isRequestingForgot, setIsRequestingForgot] = useState(false);

    const targetPath = useMemo(() => {
        const fromPath = location.state?.from?.pathname;
        return typeof fromPath === "string" && fromPath.startsWith("/admin")
            ? fromPath
            : "/admin/dashboard";
    }, [location.state]);

    const currentRole = String(currentUser?.role || "").toLowerCase();
    const isAdminSession = currentRole === "admin";

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const email = form.email.trim().toLowerCase();
        const password = form.password.trim();

        if (!email || !password) {
            setError("Email and password are required.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError("");
            const data = await loginWithEmail({ email, password });
            const role = String(data?.user?.role || "student").toLowerCase();

            if (role !== "admin") {
                logout();
                setError("This account does not have admin access.");
                return;
            }

            setAuthSession({ user: data.user, token: data.token });
            navigate(targetPath, { replace: true });
        } catch (loginError) {
            const message =
                loginError?.response?.data?.error ||
                loginError?.message ||
                "Unable to sign in with this admin account.";
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotSubmit = async (event) => {
        event.preventDefault();
        const email = String(forgotEmail || form.email || "").trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            setForgotError("Enter a valid email address.");
            return;
        }

        try {
            setIsRequestingForgot(true);
            setForgotError("");
            setForgotNotice("");
            setForgotResetUrl("");

            const response = await requestPasswordReset(email);
            const emailed = Boolean(response?.delivery?.emailed);
            setForgotNotice(
                emailed
                    ? "Password reset email sent. Please check your inbox."
                    : response?.message ||
                    "If this account exists, a reset link has been generated.",
            );
            if (response?.reset?.resetUrl) {
                setForgotResetUrl(String(response.reset.resetUrl));
            }
        } catch (forgotErr) {
            const message =
                forgotErr?.response?.data?.error ||
                forgotErr?.message ||
                "Unable to start password reset.";
            setForgotError(message);
        } finally {
            setIsRequestingForgot(false);
        }
    };

    return (
        <div className="min-h-screen overflow-hidden bg-[#06131a] px-4 py-10 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_34%)]" />

            <div className="relative mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-[28px] border border-emerald-400/20 bg-black/35 p-6 shadow-[0_24px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
                        <ShieldCheck size={14} />
                        Admin Access
                    </div>

                    <h1 className="mt-5 max-w-lg text-4xl font-black tracking-tight text-white sm:text-5xl">
                        Sign in to the control surface.
                    </h1>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-base">
                        Use an admin account to access protected moderation and oversight tools. Student accounts can keep using the compiler from the standard workspace.
                    </p>

                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-sm font-semibold text-white">Protected dashboards</p>
                            <p className="mt-2 text-sm text-white/65">
                                Review submission activity, moderation workflows, and admin-only controls.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-sm font-semibold text-white">Separate entry point</p>
                            <p className="mt-2 text-sm text-white/65">
                                Admin login is isolated so restricted routes do not bounce users back to the generic compiler UI.
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/70">
                        <Link
                            to="/compiler"
                            className="inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-medium transition hover:border-cyan-300/40 hover:text-cyan-200"
                        >
                            Return to compiler
                        </Link>
                        <Link
                            to="/"
                            className="inline-flex min-h-10 items-center rounded-xl border border-transparent px-4 py-2 font-medium text-white/75 transition hover:text-white"
                        >
                            Back to home route
                        </Link>
                    </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-[#081017]/90 p-6 shadow-[0_24px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/50">Admin Login</p>
                            <h2 className="mt-2 text-2xl font-bold text-white">Authenticate</h2>
                        </div>
                        {isAdminSession && (
                            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                Active admin session
                            </span>
                        )}
                    </div>

                    {isAdminSession ? (
                        <div className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-5">
                            <p className="text-lg font-semibold text-white">Already signed in as an admin.</p>
                            <p className="mt-2 text-sm text-white/70">
                                Continue to the dashboard or sign out before switching accounts.
                            </p>

                            <div className="mt-5 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => navigate(targetPath, { replace: true })}
                                    className="inline-flex min-h-10 items-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300"
                                >
                                    Open admin dashboard
                                </button>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-white/80">Email</span>
                                <input
                                    type="email"
                                    name="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    autoComplete="email"
                                    className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.06]"
                                    placeholder="admin@example.com"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-white/80">Password</span>
                                <input
                                    type="password"
                                    name="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    autoComplete="current-password"
                                    className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.06]"
                                    placeholder="Enter your password"
                                />
                            </label>

                            {error && (
                                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSubmitting ? "Signing in..." : "Sign in as admin"}
                            </button>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <p className="text-sm font-semibold text-white">Forgot password?</p>
                                <p className="mt-1 text-xs text-white/65">
                                    Generate a secure reset link for admin or student accounts.
                                </p>

                                <div className="mt-3 space-y-3">
                                    <input
                                        type="email"
                                        value={forgotEmail}
                                        onChange={(event) => setForgotEmail(event.target.value)}
                                        autoComplete="email"
                                        className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/45"
                                        placeholder="admin@example.com"
                                    />

                                    {forgotError && (
                                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                                            {forgotError}
                                        </div>
                                    )}

                                    {forgotNotice && (
                                        <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                                            {forgotNotice}
                                        </div>
                                    )}

                                    {forgotResetUrl && (
                                        <a
                                            href={forgotResetUrl}
                                            className="block break-all rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 underline underline-offset-2"
                                        >
                                            {forgotResetUrl}
                                        </a>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleForgotSubmit}
                                        disabled={isRequestingForgot}
                                        className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {isRequestingForgot ? "Generating reset link..." : "Generate reset link"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </section>
            </div>
        </div>
    );
}