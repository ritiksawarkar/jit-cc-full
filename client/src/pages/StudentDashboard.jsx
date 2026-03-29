import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { useCompilerStore } from "../store/useCompilerStore";
import { useNotifications } from "../hooks/useNotifications";
import NotificationCenter from "../components/NotificationCenter";
import {
    PageContainer,
    PageHeader,
    SectionCard,
    Alert,
    Button,
    ResponsiveTable
} from "../components/layout/PageLayout";
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
    const { notifications, summary } = useNotifications();
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
        <div className="min-h-screen space-y-6 bg-gradient-to-br from-gray-950 via-gray-950 to-black py-8 sm:py-12 lg:py-16">
            <PageContainer>
                <PageHeader
                    title="Student Dashboard"
                    subtitle={`Welcome ${currentUser?.name || "Student"}. Track your achievements and certificates.`}
                />

                {error && (
                    <Alert
                        type="error"
                        message={error}
                        onClose={() => setError("")}
                    />
                )}

                {success && (
                    <Alert
                        type="success"
                        message={success}
                        onClose={() => setSuccess("")}
                    />
                )}

                <div className="flex flex-col gap-3 sm:gap-4 lg:gap-6">
                    <Link to="/compiler">
                        <Button variant="primary" size="lg" className="w-full sm:w-auto">
                            Go To Compiler
                        </Button>
                    </Link>
                    <Link to="/certificates/verify">
                        <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                            Verify Certificate
                        </Button>
                    </Link>
                </div>
            </PageContainer>

            {/* Notifications Section */}
            {notifications && notifications.length > 0 && (
                <PageContainer>
                    <NotificationCenter />
                </PageContainer>
            )}

            {loading ? (
                <PageContainer>
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 text-center sm:p-8">
                        <div className="flex items-center justify-center gap-3">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-cyan-500" />
                            <p className="text-gray-400">Loading your rewards and certificates...</p>
                        </div>
                    </div>
                </PageContainer>
            ) : (
                <>
                    {/* Prizes Section */}
                    <PageContainer>
                        <SectionCard
                            title="My Prizes"
                            subtitle="Track allocation status and submit claim details."
                        >
                            {myPrizes.length === 0 ? (
                                <p className="py-8 text-center text-gray-400">
                                    No prizes allocated yet. Keep practicing! 🚀
                                </p>
                            ) : (
                                <div className="space-y-3 divide-y divide-white/10">
                                    {myPrizes.map((item) => (
                                        <div
                                            key={item.id}
                                            className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4 sm:p-6 md:p-8 first:divide-y-0"
                                        >
                                            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        Prize
                                                    </p>
                                                    <p className="mt-1 text-white">
                                                        {item.prizeId?.title || "-"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        Rank
                                                    </p>
                                                    <p className="mt-1 text-white">{item.rank ?? "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        Status
                                                    </p>
                                                    <p className="mt-1">
                                                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${item.status === "allocated"
                                                            ? "bg-amber-500/20 text-amber-200"
                                                            : "bg-emerald-500/20 text-emerald-200"
                                                            }`}>
                                                            {item.status}
                                                        </span>
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        Claimed
                                                    </p>
                                                    <p className="mt-1 text-white/80">{fmtDateTime(item.claimedAt)}</p>
                                                </div>
                                            </div>

                                            {item.status === "allocated" ? (
                                                <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                                                    <input
                                                        value={claimDetailsById[item.id] || ""}
                                                        onChange={(e) =>
                                                            setClaimDetailsById((prev) => ({
                                                                ...prev,
                                                                [item.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="Enter UPI / account / contact details for claim"
                                                        className="flex-1 rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-500/50"
                                                    />
                                                    <Button
                                                        variant="primary"
                                                        onClick={() => handleClaimPrize(item.id)}
                                                        className="w-full sm:w-auto"
                                                    >
                                                        Claim Prize
                                                    </Button>
                                                </div>
                                            ) : (
                                                <p className="pt-2 text-xs text-gray-500">
                                                    Claim Details: <span className="text-gray-400">{item.claimDetails || "-"}</span>
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    </PageContainer>

                    {/* Certificates Section */}
                    <PageContainer>
                        <SectionCard
                            title="My Certificates"
                            subtitle="Verify certificates, copy codes, and download PDF summaries."
                        >
                            {myCertificates.length === 0 ? (
                                <p className="py-8 text-center text-gray-400">
                                    No certificates issued yet. 📜
                                </p>
                            ) : (
                                <>
                                    {/* Header Link */}
                                    <div className="pb-4">
                                        <Link to="/certificates/verify">
                                            <Button variant="secondary" size="base">
                                                Open Public Verification Page
                                            </Button>
                                        </Link>
                                    </div>

                                    {/* Responsive Table */}
                                    <ResponsiveTable className="border-0">
                                        <table className="w-full text-left text-sm">
                                            <thead className="border-b border-white/10 bg-white/5">
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold text-gray-400 lg:px-6">
                                                        Event
                                                    </th>
                                                    <th className="px-4 py-3 font-semibold text-gray-400 lg:px-6">
                                                        Rank
                                                    </th>
                                                    <th className="hidden px-4 py-3 font-semibold text-gray-400 lg:px-6 md:table-cell">
                                                        Merit
                                                    </th>
                                                    <th className="hidden px-4 py-3 font-semibold text-gray-400 lg:px-6 xl:table-cell">
                                                        Certificate #
                                                    </th>
                                                    <th className="hidden px-4 py-3 font-semibold text-gray-400 lg:px-6 xl:table-cell">
                                                        Issued
                                                    </th>
                                                    <th className="px-4 py-3 font-semibold text-gray-400 lg:px-6">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/10">
                                                {myCertificates.map((item) => (
                                                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-4 py-4 lg:px-6">
                                                            <span className="font-medium text-white">
                                                                {item.eventId?.title || "-"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 text-white/80 lg:px-6">
                                                            {item.rank ?? "-"}
                                                        </td>
                                                        <td className="hidden px-4 py-4 text-white/80 md:table-cell lg:px-6">
                                                            {item.merit || "none"}
                                                        </td>
                                                        <td className="hidden px-4 py-4 text-gray-500 xl:table-cell lg:px-6">
                                                            <code className="text-xs">{item.certificateNo.slice(0, 8)}...</code>
                                                        </td>
                                                        <td className="hidden px-4 py-4 text-gray-500 xl:table-cell lg:px-6 text-xs">
                                                            {fmtDateTime(item.issuedAt)}
                                                        </td>
                                                        <td className="px-4 py-4 lg:px-6">
                                                            <div className="flex flex-wrap gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleVerifyCertificate(item.verificationCode)}
                                                                    disabled={verifyingCode === item.verificationCode}
                                                                    className="whitespace-nowrap text-xs sm:text-sm"
                                                                >
                                                                    {verifyingCode === item.verificationCode
                                                                        ? "Verifying..."
                                                                        : "Verify"}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        handleCopyVerificationCode(item.verificationCode)
                                                                    }
                                                                    className="whitespace-nowrap text-xs sm:text-sm"
                                                                >
                                                                    Copy
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        void downloadBrandedCertificatePdf(
                                                                            item,
                                                                            certificateAssets
                                                                        );
                                                                    }}
                                                                    className="whitespace-nowrap text-xs sm:text-sm"
                                                                >
                                                                    PDF
                                                                </Button>
                                                                <Link to={`/certificates/verify?code=${encodeURIComponent(item.verificationCode || "")}`}>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="whitespace-nowrap text-xs sm:text-sm"
                                                                    >
                                                                        Public
                                                                    </Button>
                                                                </Link>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </ResponsiveTable>
                                </>
                            )}
                        </SectionCard>
                    </PageContainer>
                </>
            )}
        </div>
    );
}
