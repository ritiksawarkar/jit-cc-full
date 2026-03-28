import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { useCompilerStore } from "../store/useCompilerStore";
import {
    claimPrizeAllocation,
    fetchPublicCertificateAssets,
    fetchMyCertificates,
    fetchMyPrizes,
    verifyCertificate,
} from "../services/api";

const DEFAULT_CERTIFICATE_ASSETS = {
    logo: { url: "/certificate-assets/organization-logo.svg" },
    signature: { url: "/certificate-assets/signature-scan.svg" },
    seal: { url: "/certificate-assets/official-seal.svg" },
};

function fmtDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString();
    } catch {
        return String(value);
    }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

async function imageUrlToPngDataUrl(url) {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
}

async function downloadBrandedCertificatePdf(certificate, certificateAssets = DEFAULT_CERTIFICATE_ASSETS) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 44;
    const contentWidth = width - margin * 2;
    const studentName = certificate?.userId?.name || "Student";
    const eventTitle = certificate?.eventId?.title || "Online Coding Event";
    const certificateNo = certificate?.certificateNo || "-";
    const verificationCode = certificate?.verificationCode || "-";
    const merit = String(certificate?.merit || "none").toUpperCase();

    // Outer frame
    doc.setFillColor(250, 250, 250);
    doc.rect(0, 0, width, height, "F");
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.2);
    doc.rect(24, 24, width - 48, height - 48);
    doc.setDrawColor(14, 116, 144);
    doc.setLineWidth(0.8);
    doc.rect(32, 32, width - 64, height - 64);

    let logoDataUrl = null;
    let signatureDataUrl = null;
    let sealDataUrl = null;

    try {
        const logoUrl = certificateAssets?.logo?.url || DEFAULT_CERTIFICATE_ASSETS.logo.url;
        const signatureUrl = certificateAssets?.signature?.url || DEFAULT_CERTIFICATE_ASSETS.signature.url;
        const sealUrl = certificateAssets?.seal?.url || DEFAULT_CERTIFICATE_ASSETS.seal.url;
        [logoDataUrl, signatureDataUrl, sealDataUrl] = await Promise.all([
            imageUrlToPngDataUrl(logoUrl),
            imageUrlToPngDataUrl(signatureUrl),
            imageUrlToPngDataUrl(sealUrl),
        ]);
    } catch {
        // Fallbacks below keep PDF generation functional even if assets fail to load.
    }

    // Header strip
    doc.setFillColor(8, 47, 73);
    doc.roundedRect(margin, margin, contentWidth, 92, 10, 10, "F");

    if (logoDataUrl) {
        doc.addImage(logoDataUrl, "PNG", margin + 10, margin + 10, 220, 72);
    } else {
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 34, margin + 46, 22, "F");
        doc.setTextColor(8, 47, 73);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("JIT", margin + 24, margin + 50);
    }

    // Brand text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("JIT Code Compiler", margin + 248, margin + 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Official Achievement Certificate", margin + 248, margin + 54);

    doc.setFont("times", "bold");
    doc.setFontSize(34);
    doc.text("CERTIFICATE OF ACHIEVEMENT", width / 2, margin + 144, {
        align: "center",
    });

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text("This certifies that", width / 2, margin + 182, { align: "center" });

    doc.setTextColor(15, 23, 42);
    doc.setFont("times", "bolditalic");
    doc.setFontSize(30);
    doc.text(studentName, width / 2, margin + 222, { align: "center" });

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("has successfully secured distinction in", width / 2, margin + 250, {
        align: "center",
    });

    doc.setTextColor(14, 116, 144);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(eventTitle, width / 2, margin + 278, { align: "center" });

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
        `Rank: ${certificate?.rank ?? "-"}   |   Merit: ${merit}   |   Issued: ${fmtDateTime(certificate?.issuedAt)}`,
        width / 2,
        margin + 304,
        { align: "center" },
    );

    // Certificate details panel
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(margin + 20, margin + 334, contentWidth - 40, 86, 8, 8);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Certificate No: ${certificateNo}`, margin + 36, margin + 364);
    doc.text(`Verification Code: ${verificationCode}`, margin + 36, margin + 388);
    doc.text(
        `Total Score: ${certificate?.totalScore ?? "-"}   |   Status: ${certificate?.status || "issued"}`,
        margin + 36,
        margin + 412,
    );

    // Signature block
    const signatureY = height - 128;
    doc.setDrawColor(71, 85, 105);
    doc.line(margin + 34, signatureY, margin + 210, signatureY);
    if (signatureDataUrl) {
        doc.addImage(signatureDataUrl, "PNG", margin + 38, signatureY - 58, 168, 46);
    } else {
        doc.setFont("times", "italic");
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Contest Director", margin + 46, signatureY - 8);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Authorized Signature", margin + 34, signatureY + 14);

    // Seal stamp
    const sealX = width - margin - 92;
    const sealY = height - 124;
    if (sealDataUrl) {
        doc.addImage(sealDataUrl, "PNG", sealX - 46, sealY - 46, 92, 92);
    } else {
        doc.setDrawColor(13, 148, 136);
        doc.setLineWidth(2);
        doc.circle(sealX, sealY, 40);
        doc.setLineWidth(1);
        doc.circle(sealX, sealY, 32);
        doc.setTextColor(13, 148, 136);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("OFFICIAL", sealX, sealY - 6, { align: "center" });
        doc.text("SEAL", sealX, sealY + 8, { align: "center" });
    }

    // Footer note
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
        "Verify authenticity at /certificates/verify using verification code.",
        width / 2,
        height - 40,
        { align: "center" },
    );
    doc.save(`${certificate?.certificateNo || "certificate"}.pdf`);
}

async function copyToClipboard(text) {
    const content = String(text || "").trim();
    if (!content) return false;

    if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        return true;
    }

    const input = document.createElement("textarea");
    input.value = content;
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
}

export default function StudentDashboard() {
    const currentUser = useCompilerStore((s) => s.currentUser);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [myPrizes, setMyPrizes] = useState([]);
    const [myCertificates, setMyCertificates] = useState([]);
    const [certificateAssets, setCertificateAssets] = useState(DEFAULT_CERTIFICATE_ASSETS);
    const [claimDetailsById, setClaimDetailsById] = useState({});
    const [verifyingCode, setVerifyingCode] = useState("");

    const loadStudentRewards = async () => {
        setLoading(true);
        setError("");
        try {
            const [prizeData, certData] = await Promise.all([
                fetchMyPrizes(),
                fetchMyCertificates(),
            ]);
            setMyPrizes(prizeData?.allocations || []);
            setMyCertificates(certData?.certificates || []);

            try {
                const assetsData = await fetchPublicCertificateAssets();
                if (assetsData?.assets) {
                    setCertificateAssets({ ...DEFAULT_CERTIFICATE_ASSETS, ...assetsData.assets });
                }
            } catch {
                // fallback default asset paths
            }
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || "Unable to load rewards and certificates");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStudentRewards();
    }, []);

    const handleClaimPrize = async (allocationId) => {
        const details = String(claimDetailsById[allocationId] || "").trim();
        if (!details) {
            setError("Please add claim details before claiming a prize.");
            return;
        }

        setError("");
        setSuccess("");
        try {
            await claimPrizeAllocation(allocationId, details);
            await loadStudentRewards();
            setClaimDetailsById((prev) => ({ ...prev, [allocationId]: "" }));
            setSuccess("Prize claimed successfully.");
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || "Unable to claim prize");
        }
    };

    const handleVerifyCertificate = async (code) => {
        setVerifyingCode(code);
        setError("");
        setSuccess("");
        try {
            const data = await verifyCertificate(code);
            if (data?.verified) {
                setSuccess(`Certificate ${code} verified successfully.`);
            } else {
                setError("Certificate verification failed.");
            }
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || "Unable to verify certificate");
        } finally {
            setVerifyingCode("");
        }
    };

    const handleCopyVerificationCode = async (code) => {
        setError("");
        setSuccess("");
        try {
            const ok = await copyToClipboard(code);
            if (ok) {
                setSuccess("Verification code copied.");
            } else {
                setError("Unable to copy verification code.");
            }
        } catch {
            setError("Unable to copy verification code.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-6xl rounded-2xl border border-cyan-500/20 bg-black/40 p-6">
                <h1 className="text-2xl font-bold">Student Dashboard</h1>
                <p className="mt-2 text-sm text-white/70">
                    Welcome {currentUser?.name || "Student"}. Access the compiler and track your practice.
                </p>

                {(error || success) && (
                    <div className="mt-4 space-y-2">
                        {error && (
                            <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                {error}
                            </p>
                        )}
                        {success && (
                            <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                {success}
                            </p>
                        )}
                    </div>
                )}

                <div className="mt-6">
                    <Link
                        to="/compiler"
                        className="inline-flex min-h-10 items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black"
                    >
                        Go To Compiler
                    </Link>
                </div>

                {loading ? (
                    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                        Loading rewards and certificates...
                    </div>
                ) : (
                    <>
                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">My Prizes</h2>
                            <p className="mt-1 text-sm text-white/70">Track allocation status and submit claim details.</p>

                            {myPrizes.length === 0 ? (
                                <p className="mt-3 text-sm text-white/70">No prizes allocated yet.</p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {myPrizes.map((item) => (
                                        <div key={item.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                                <p><span className="text-white/60">Prize:</span> {item.prizeId?.title || "-"}</p>
                                                <p><span className="text-white/60">Rank:</span> {item.rank ?? "-"}</p>
                                                <p><span className="text-white/60">Status:</span> {item.status}</p>
                                                <p><span className="text-white/60">Claimed:</span> {fmtDateTime(item.claimedAt)}</p>
                                            </div>

                                            {item.status === "allocated" ? (
                                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                                    <input
                                                        value={claimDetailsById[item.id] || ""}
                                                        onChange={(e) => setClaimDetailsById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                        placeholder="Enter UPI / account / contact details for claim"
                                                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleClaimPrize(item.id)}
                                                        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black"
                                                    >
                                                        Claim Prize
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs text-white/65">Claim Details: {item.claimDetails || "-"}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">My Certificates</h2>
                            <p className="mt-1 text-sm text-white/70">Verify certificates, copy code, and download PDF certificate summary.</p>

                            <div className="mt-3">
                                <Link
                                    to="/certificates/verify"
                                    className="inline-flex min-h-10 items-center rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200"
                                >
                                    Open Public Verification Page
                                </Link>
                            </div>

                            {myCertificates.length === 0 ? (
                                <p className="mt-3 text-sm text-white/70">No certificates issued yet.</p>
                            ) : (
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[860px] text-left text-sm">
                                        <thead className="text-white/60">
                                            <tr>
                                                <th className="py-2 pr-3">Event</th>
                                                <th className="py-2 pr-3">Rank</th>
                                                <th className="py-2 pr-3">Merit</th>
                                                <th className="py-2 pr-3">Certificate No</th>
                                                <th className="py-2 pr-3">Verification Code</th>
                                                <th className="py-2 pr-3">Issued At</th>
                                                <th className="py-2 pr-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {myCertificates.map((item) => (
                                                <tr key={item.id} className="border-t border-white/10">
                                                    <td className="py-2 pr-3 text-white">{item.eventId?.title || "-"}</td>
                                                    <td className="py-2 pr-3 text-white/80">{item.rank ?? "-"}</td>
                                                    <td className="py-2 pr-3 text-white/80">{item.merit || "none"}</td>
                                                    <td className="py-2 pr-3 text-white/80">{item.certificateNo}</td>
                                                    <td className="py-2 pr-3 text-white/80">{item.verificationCode}</td>
                                                    <td className="py-2 pr-3 text-white/70">{fmtDateTime(item.issuedAt)}</td>
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleVerifyCertificate(item.verificationCode)}
                                                                disabled={verifyingCode === item.verificationCode}
                                                                className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 disabled:opacity-70"
                                                            >
                                                                {verifyingCode === item.verificationCode ? "Verifying..." : "Verify"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyVerificationCode(item.verificationCode)}
                                                                className="rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-200"
                                                            >
                                                                Copy Code
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    void downloadBrandedCertificatePdf(item, certificateAssets);
                                                                }}
                                                                className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                            >
                                                                Download PDF
                                                            </button>
                                                            <Link
                                                                to={`/certificates/verify?code=${encodeURIComponent(item.verificationCode || "")}`}
                                                                className="rounded border border-white/30 px-2 py-1 text-xs text-white/85"
                                                            >
                                                                Public Verify
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
