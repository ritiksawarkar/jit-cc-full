import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyCertificate } from "../services/api";

function fmtDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString();
    } catch {
        return String(value);
    }
}

export default function CertificateVerifyPage() {
    const [searchParams] = useSearchParams();
    const initialCode = String(searchParams.get("code") || "").trim();
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);

    const verifyByCode = async (value) => {
        const normalized = String(value || "").trim();
        if (!normalized) {
            setError("Enter verification code.");
            return false;
        }

        setLoading(true);
        setError("");
        setResult(null);
        try {
            const data = await verifyCertificate(normalized);
            if (!data?.verified || !data?.certificate) {
                setError("Certificate verification failed.");
                return false;
            }
            setResult(data.certificate);
            return true;
        } catch (err) {
            setError(
                err?.response?.data?.error || err?.message || "Unable to verify certificate",
            );
            return false;
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        if (!initialCode) return;
        setCode(initialCode);
        verifyByCode(initialCode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCode]);

    const handleVerify = async (event) => {
        event.preventDefault();
        await verifyByCode(code);
    };

    return (
        <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-3xl rounded-2xl border border-cyan-500/20 bg-black/40 p-6">
                <h1 className="text-2xl font-bold">Certificate Verification</h1>
                <p className="mt-2 text-sm text-white/70">
                    Paste verification code to validate certificate authenticity.
                </p>

                <form onSubmit={handleVerify} className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Example: VERIFY-1A2B3C4D"
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
                    >
                        {loading ? "Verifying..." : "Verify"}
                    </button>
                </form>

                {error && (
                    <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                        {error}
                    </p>
                )}

                {result && (
                    <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                        <p className="text-sm font-semibold text-emerald-100">Certificate verified successfully</p>
                        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                            <p><span className="text-white/65">Student:</span> {result.userId?.name || "-"}</p>
                            <p><span className="text-white/65">Event:</span> {result.eventId?.title || "-"}</p>
                            <p><span className="text-white/65">Rank:</span> {result.rank ?? "-"}</p>
                            <p><span className="text-white/65">Merit:</span> {result.merit || "none"}</p>
                            <p><span className="text-white/65">Certificate No:</span> {result.certificateNo || "-"}</p>
                            <p><span className="text-white/65">Issued At:</span> {fmtDateTime(result.issuedAt)}</p>
                        </div>
                    </div>
                )}

                <div className="mt-6">
                    <Link
                        to="/dashboard"
                        className="inline-flex min-h-10 items-center rounded-lg border border-white/20 px-4 py-2 text-sm text-white/85"
                    >
                        Back To Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
