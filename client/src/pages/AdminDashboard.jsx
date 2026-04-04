import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCompilerStore } from "../store/useCompilerStore";
import {
    adminUnlockEventProblemSelection,
    archiveProblem,
    allocateEventPrizes,
    bulkImportProblems,
    bulkUpsertEventAttendance,
    computeAdminEventResults,
    createProblem,
    createCertificateTemplate,
    fetchAdminCertificateAssets,
    createAdminEvent,
    createEventPrize,
    fetchEvents,
    fetchProblems,
    deliverPrizeAllocation,
    fetchAdminEventResults,
    fetchUserSubmissions,
    fetchCertificateTemplates,
    fetchEventCertificates,
    fetchEventPrizeAllocations,
    fetchEventPrizes,
    deleteAdminEvent,
    fetchAdminAuditLogs,
    fetchAdminStudents,
    fetchAdminEvents,
    fetchAdminEventProblemSelections,
    fetchAdminOverview,
    fetchEventAttendanceSummary,
    fetchRoleChangeRequests,
    finalizeAdminEventResults,
    forceStudentPasswordReset,
    issueEventCertificates,
    resetAdminCertificateAssets,
    reviewRoleChangeRequest,
    setStudentFreeze,
    uploadAdminCertificateAsset,
    upsertEventAttendance,
    updateAdminEvent,
    updateProblem,
} from "../services/api";

const DEFAULT_CERTIFICATE_ASSETS = {
    logo: { key: "logo", url: "/certificate-assets/organization-logo.svg" },
    signature: { key: "signature", url: "/certificate-assets/signature-scan.svg" },
    seal: { key: "seal", url: "/certificate-assets/official-seal.svg" },
};

const ASSET_IMAGE_SPECS = {
    logo: { width: 600, height: 200, label: "600 x 200" },
    signature: { width: 520, height: 160, label: "520 x 160" },
    seal: { width: 420, height: 420, label: "420 x 420" },
};

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_RASTER_DIMENSION = 1600;
const PROBLEM_PAGE_SIZE = 8;

const INITIAL_PROBLEM_FORM = {
    title: "",
    statement: "",
    sampleInput: "",
    sampleOutput: "",
    expectedOutput: "",
    eventId: "",
    difficulty: "medium",
    totalPoints: 100,
    passingThreshold: 100,
    tagsText: "",
    isCompetitive: true,
    isActive: true,
};

function toProblemForm(problem = null) {
    if (!problem) {
        return { ...INITIAL_PROBLEM_FORM };
    }

    return {
        title: String(problem.title || ""),
        statement: String(problem.statement || ""),
        sampleInput: String(problem.sampleInput || ""),
        sampleOutput: String(problem.sampleOutput || ""),
        expectedOutput: String(problem.expectedOutput || ""),
        eventId: String(problem.event?.id || problem.eventId || ""),
        difficulty: String(problem.difficulty || "medium"),
        totalPoints: Number(problem.totalPoints || 100),
        passingThreshold: Number(problem.passingThreshold ?? 100),
        tagsText: Array.isArray(problem.tags) ? problem.tags.join(", ") : "",
        isCompetitive: Boolean(problem.isCompetitive ?? true),
        isActive: Boolean(problem.isActive ?? true),
    };
}

function parseCsvLine(line) {
    const out = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === "," && !inQuotes) {
            out.push(current.trim());
            current = "";
            continue;
        }

        current += ch;
    }

    out.push(current.trim());
    return out;
}

function fmtDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString();
    } catch {
        return String(value);
    }
}

function fmtEventDuration(startAt, endAt) {
    const startMs = new Date(startAt || 0).getTime();
    const endMs = new Date(endAt || 0).getTime();
    const diffMs = endMs - startMs;
    if (!Number.isFinite(diffMs) || diffMs <= 0) return "-";

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

async function parseFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

function parseJsonImportFile(content) {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
}

function parseCsvImportFile(content) {
    const lines = content.trim().split("\n");
    if (lines.length < 2) {
        throw new Error("CSV file must have header row + at least 1 data row");
    }

    const headers = parseCsvLine(lines[0].toLowerCase());
    const requiredHeaders = ["title", "statement", "testcases"];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
    }

    const problems = [];
    for (let i = 1; i < lines.length; i += 1) {
        if (!lines[i].trim()) continue;

        const values = parseCsvLine(lines[i]);
        const row = {};
        for (let j = 0; j < headers.length; j += 1) {
            row[headers[j]] = values[j] || "";
        }

        try {
            const testCases = JSON.parse(row.testcases || "[]");
            problems.push({
                title: row.title || "",
                statement: row.statement || "",
                difficulty: row.difficulty ? String(row.difficulty).toLowerCase() : "medium",
                totalPoints: Number(row.totalpoints) || 100,
                passingThreshold: Number(row.passingthreshold) || 100,
                tags: row.tags ? String(row.tags).split("|").map((t) => t.trim()) : [],
                testCases: Array.isArray(testCases) ? testCases : [],
            });
        } catch (err) {
            throw new Error(
                `Row ${i + 1}: Invalid testCases JSON. Error: ${err.message}`,
            );
        }
    }

    return problems;
}

function fmtMs(value) {
    const ms = Number(value || 0);
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    return `${ms.toFixed(0)} ms`;
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(file);
    });
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Unable to decode image"));
        };
        img.src = objectUrl;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Unable to encode image"));
                return;
            }
            resolve(blob);
        }, type, quality);
    });
}

function getAssetSpec(assetKey) {
    return ASSET_IMAGE_SPECS[String(assetKey || "logo")] || ASSET_IMAGE_SPECS.logo;
}

function drawCenterCroppedImage(ctx, img, outputWidth, outputHeight) {
    const sourceWidth = img.width || outputWidth;
    const sourceHeight = img.height || outputHeight;
    const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
    const targetRatio = outputWidth / Math.max(1, outputHeight);

    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (sourceRatio > targetRatio) {
        cropWidth = Math.round(sourceHeight * targetRatio);
    } else if (sourceRatio < targetRatio) {
        cropHeight = Math.round(sourceWidth / targetRatio);
    }

    const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));

    ctx.drawImage(
        img,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight,
    );
}

async function optimizeAssetFile(file, assetKey) {
    const mime = String(file?.type || "").toLowerCase();
    const spec = getAssetSpec(assetKey);
    if (!mime.startsWith("image/")) {
        throw new Error("Only image files are allowed");
    }

    if (mime === "image/svg+xml") {
        if (file.size > MAX_ASSET_BYTES) {
            throw new Error("SVG is too large. Max allowed size is 2MB.");
        }
        return {
            dataUrl: await fileToDataUrl(file),
            fileName: file.name,
            bytes: file.size,
        };
    }

    const img = await loadImageFromFile(file);
    const specMax = Math.max(spec.width, spec.height);
    const scale = Math.min(1, MAX_RASTER_DIMENSION / Math.max(1, specMax));
    const width = Math.max(1, Math.round(spec.width * scale));
    const height = Math.max(1, Math.round(spec.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Unable to process image");
    }
    drawCenterCroppedImage(ctx, img, width, height);

    let bestBlob = null;
    const attempts = [
        { type: "image/webp", quality: 0.82 },
        { type: "image/webp", quality: 0.72 },
        { type: "image/jpeg", quality: 0.8 },
        { type: "image/jpeg", quality: 0.68 },
        { type: "image/jpeg", quality: 0.56 },
    ];

    for (const attempt of attempts) {
        const blob = await canvasToBlob(canvas, attempt.type, attempt.quality);
        bestBlob = blob;
        if (blob.size <= MAX_ASSET_BYTES) {
            break;
        }
    }

    if (!bestBlob || bestBlob.size > MAX_ASSET_BYTES) {
        throw new Error("Image remains above 2MB after compression. Please use a smaller image.");
    }

    const ext = bestBlob.type === "image/webp" ? "webp" : "jpg";
    const originalBase = String(file.name || "asset").replace(/\.[^.]+$/, "");
    const optimizedFileName = `${originalBase}-optimized.${ext}`;
    const optimizedFile = new File([bestBlob], optimizedFileName, { type: bestBlob.type });

    return {
        dataUrl: await fileToDataUrl(optimizedFile),
        fileName: optimizedFile.name,
        bytes: bestBlob.size,
        width,
        height,
    };
}

export default function AdminDashboard() {
    const currentUser = useCompilerStore((s) => s.currentUser);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [events, setEvents] = useState([]);
    const [eventScope, setEventScope] = useState("future");
    const [eventLoading, setEventLoading] = useState(false);
    const [eventError, setEventError] = useState("");
    const [eventForm, setEventForm] = useState({
        title: "",
        description: "",
        startAt: "",
        endAt: "",
    });
    const [editingEventId, setEditingEventId] = useState("");
    const [isSavingEvent, setIsSavingEvent] = useState(false);
    const [attendanceSummary, setAttendanceSummary] = useState([]);
    const [attendanceEventId, setAttendanceEventId] = useState("");
    const [attendanceUserId, setAttendanceUserId] = useState("");
    const [attendanceStatus, setAttendanceStatus] = useState("registered");
    const [adminStudents, setAdminStudents] = useState([]);
    const [roleRequests, setRoleRequests] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [quickMessage, setQuickMessage] = useState("");
    const [quickError, setQuickError] = useState("");
    const [freezeModalStudent, setFreezeModalStudent] = useState(null);
    const [freezeReason, setFreezeReason] = useState("");
    const [bulkCsvFileName, setBulkCsvFileName] = useState("");
    const [bulkRows, setBulkRows] = useState([]);
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [profileStudent, setProfileStudent] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileSubmissions, setProfileSubmissions] = useState([]);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [resultEventId, setResultEventId] = useState("");
    const [resultLoading, setResultLoading] = useState(false);
    const [resultError, setResultError] = useState("");
    const [resultLeaderboard, setResultLeaderboard] = useState(null);
    const [selectionEventId, setSelectionEventId] = useState("");
    const [selectionLoading, setSelectionLoading] = useState(false);
    const [selectionError, setSelectionError] = useState("");
    const [selectionRows, setSelectionRows] = useState([]);
    const [selectionPage, setSelectionPage] = useState(1);
    const [selectionLimit] = useState(20);
    const [selectionTotal, setSelectionTotal] = useState(0);
    const [selectionTotalPages, setSelectionTotalPages] = useState(0);
    const [unlockReasonByUser, setUnlockReasonByUser] = useState({});
    const [unlockingUserId, setUnlockingUserId] = useState("");
    const [prizeEventId, setPrizeEventId] = useState("");
    const [prizeLoading, setPrizeLoading] = useState(false);
    const [prizeError, setPrizeError] = useState("");
    const [eventPrizes, setEventPrizes] = useState([]);
    const [prizeAllocations, setPrizeAllocations] = useState([]);
    const [prizeForm, setPrizeForm] = useState({
        title: "",
        description: "",
        kind: "custom",
        rankFrom: "1",
        rankTo: "1",
        amount: "",
        currency: "INR",
        maxRecipients: "1",
    });
    const [certificateEventId, setCertificateEventId] = useState("");
    const [certificateLoading, setCertificateLoading] = useState(false);
    const [certificateError, setCertificateError] = useState("");
    const [certificateTemplates, setCertificateTemplates] = useState([]);
    const [issuedCertificates, setIssuedCertificates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [templateForm, setTemplateForm] = useState({
        name: "",
        templateText: "Congratulations {{userName}} for securing rank {{rank}} in {{eventTitle}}.",
        isDefault: true,
    });
    const [certificateAssets, setCertificateAssets] = useState(DEFAULT_CERTIFICATE_ASSETS);
    const [assetUploadingKey, setAssetUploadingKey] = useState("");
    const [assetError, setAssetError] = useState("");
    const [problemBank, setProblemBank] = useState([]);
    const [problemBankLoading, setProblemBankLoading] = useState(false);
    const [problemBankError, setProblemBankError] = useState("");
    const [problemSearch, setProblemSearch] = useState("");
    const [problemDifficultyFilter, setProblemDifficultyFilter] = useState("all");
    const [problemStatusFilter, setProblemStatusFilter] = useState("all");
    const [problemPage, setProblemPage] = useState(1);
    const [problemPageSize, setProblemPageSize] = useState(20);
    const [problemTotalPages, setProblemTotalPages] = useState(0);
    const [problemTotalCount, setProblemTotalCount] = useState(0);
    const [problemEvents, setProblemEvents] = useState([]);
    const [problemEventFilter, setProblemEventFilter] = useState("");
    const [editingProblemId, setEditingProblemId] = useState("");
    const [problemForm, setProblemForm] = useState(INITIAL_PROBLEM_FORM);
    const [problemSaving, setProblemSaving] = useState(false);
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);
    const [bulkImportFile, setBulkImportFile] = useState(null);
    const [bulkImportConflictMode, setBulkImportConflictMode] = useState("skip");
    const [bulkImportEventId, setBulkImportEventId] = useState("");
    const [bulkImportPreview, setBulkImportPreview] = useState([]);
    const [bulkImportLoading, setBulkImportLoading] = useState(false);
    const [bulkImportResults, setBulkImportResults] = useState(null);

    const loadOverview = async () => {
        const data = await fetchAdminOverview();
        setOverview(data);
    };

    const loadEvents = async (scope = eventScope) => {
        setEventLoading(true);
        setEventError("");
        try {
            const data = await fetchAdminEvents(scope);
            setEvents(data?.events || []);
        } catch (err) {
            setEventError(err?.response?.data?.error || err?.message || "Unable to load events");
        } finally {
            setEventLoading(false);
        }
    };

    const loadProblemBank = async (pageNum = 1, pageSize = 20, eventId = problemEventFilter) => {
        setProblemBankLoading(true);
        setProblemBankError("");
        try {
            const data = await fetchProblems(true, pageNum, pageSize, eventId);
            setProblemBank(Array.isArray(data?.problems) ? data.problems : []);
            setProblemTotalCount(data?.total || 0);
            setProblemTotalPages(data?.totalPages || 0);
            setProblemPage(pageNum);
            setProblemPageSize(pageSize);
        } catch (err) {
            setProblemBankError(err?.response?.data?.error || err?.message || "Unable to load problem bank");
        } finally {
            setProblemBankLoading(false);
        }
    };

    const loadAdminOpsData = async () => {
        const [problemEventsData, attendanceData, studentsData, roleReqData, logsData] = await Promise.all([
            fetchEvents(),
            fetchEventAttendanceSummary(),
            fetchAdminStudents(),
            fetchRoleChangeRequests("pending"),
            fetchAdminAuditLogs(60),
        ]);

        setProblemEvents(Array.isArray(problemEventsData?.events) ? problemEventsData.events : []);
        setAttendanceSummary(attendanceData?.events || []);
        setAdminStudents(studentsData?.students || []);
        setRoleRequests(roleReqData?.requests || []);
        setAuditLogs(logsData?.logs || []);
    };

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                setLoading(true);
                setError("");
                const [overviewData, eventData, allEventsData, attendanceData, studentsData, roleReqData, logsData, problemsData] = await Promise.all([
                    fetchAdminOverview(),
                    fetchAdminEvents("future"),
                    fetchEvents(),
                    fetchEventAttendanceSummary(),
                    fetchAdminStudents(),
                    fetchRoleChangeRequests("pending"),
                    fetchAdminAuditLogs(60),
                    fetchProblems(true),
                ]);
                if (!active) return;
                setOverview(overviewData);
                setEvents(eventData?.events || []);
                setProblemEvents(Array.isArray(allEventsData?.events) ? allEventsData.events : []);
                setAttendanceSummary(attendanceData?.events || []);
                setAdminStudents(studentsData?.students || []);
                setRoleRequests(roleReqData?.requests || []);
                setAuditLogs(logsData?.logs || []);
                setProblemBank(Array.isArray(problemsData?.problems) ? problemsData.problems : []);
            } catch (err) {
                if (!active) return;
                setError(err?.response?.data?.error || err?.message || "Unable to load admin dashboard");
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!overview) return;
        loadEvents(eventScope);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventScope]);

    useEffect(() => {
        if (!events.length) {
            return;
        }

        const firstId = events[0]?.id || "";
        if (firstId && !resultEventId) {
            setResultEventId(firstId);
        }
        if (firstId && !selectionEventId) {
            setSelectionEventId(firstId);
        }
        if (firstId && !prizeEventId) {
            setPrizeEventId(firstId);
        }
        if (firstId && !certificateEventId) {
            setCertificateEventId(firstId);
        }
    }, [events, resultEventId, selectionEventId, prizeEventId, certificateEventId]);

    const summaryCards = useMemo(() => {
        if (!overview?.summary) return [];
        return [
            { label: "Total Students", value: overview.summary.totalStudents ?? 0 },
            { label: "Total Admins", value: overview.summary.totalAdmins ?? 0 },
            { label: "Total Problems", value: overview.summary.totalProblems ?? 0 },
            { label: "Total Submissions", value: overview.summary.totalSubmissions ?? 0 },
            { label: "Today's Submissions", value: overview.summary.todaySubmissions ?? 0 },
            { label: "Generated At", value: fmtDateTime(overview.generatedAt) },
        ];
    }, [overview]);

    const statusItems = useMemo(() => {
        const breakdown = overview?.summary?.statusBreakdown || {};
        return [
            { label: "Accepted", value: breakdown.Accepted || 0 },
            { label: "Wrong Answer", value: breakdown["Wrong Answer"] || 0 },
            { label: "Runtime Error", value: breakdown["Runtime Error"] || 0 },
            { label: "Compilation Error", value: breakdown["Compilation Error"] || 0 },
        ];
    }, [overview]);

    const displayedProblems = useMemo(() => {
        const search = String(problemSearch || "").trim().toLowerCase();
        return (problemBank || []).filter((problem) => {
            const tags = Array.isArray(problem.tags) ? problem.tags.join(", ") : "";
            const matchesSearch =
                !search ||
                String(problem.title || "").toLowerCase().includes(search) ||
                String(tags).toLowerCase().includes(search);
            const matchesDifficulty =
                problemDifficultyFilter === "all" ||
                String(problem.difficulty || "").toLowerCase() === problemDifficultyFilter;
            const matchesStatus =
                problemStatusFilter === "all" ||
                (problemStatusFilter === "active" && problem.isActive) ||
                (problemStatusFilter === "archived" && !problem.isActive);
            return matchesSearch && matchesDifficulty && matchesStatus;
        });
    }, [problemBank, problemDifficultyFilter, problemSearch, problemStatusFilter]);

    const handleEventFormChange = (event) => {
        const { name, value } = event.target;
        setEventForm((prev) => ({ ...prev, [name]: value }));
    };

    const resetEventForm = () => {
        setEventForm({ title: "", description: "", startAt: "", endAt: "" });
        setEditingEventId("");
        setEventError("");
    };

    const resolveProblemEventTitle = (problem) => {
        const eventId = String(problem?.event?.id || problem?.eventId || "");
        const directTitle = String(problem?.event?.title || "").trim();
        if (directTitle) return directTitle;
        return problemEvents.find((item) => String(item.id) === eventId)?.title || "Unassigned Event";
    };

    const onEditEvent = (eventItem) => {
        setEditingEventId(eventItem.id);
        setEventForm({
            title: eventItem.title || "",
            description: eventItem.description || "",
            startAt: eventItem.startAt ? String(eventItem.startAt).slice(0, 16) : "",
            endAt: eventItem.endAt ? String(eventItem.endAt).slice(0, 16) : "",
        });
    };

    const handleProblemFormChange = (event) => {
        const { name, value, type, checked } = event.target;
        setProblemForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const resetProblemForm = () => {
        setEditingProblemId("");
        setProblemForm({ ...INITIAL_PROBLEM_FORM });
        setProblemBankError("");
    };

    const handleEditProblem = (problem) => {
        setEditingProblemId(String(problem.id));
        setProblemForm(toProblemForm(problem));
        setProblemBankError("");
    };

    const handleSaveProblem = async (event) => {
        event.preventDefault();
        const title = String(problemForm.title || "").trim();
        const statement = String(problemForm.statement || "").trim();
        const eventId = String(problemForm.eventId || "").trim();
        if (!title || !statement) {
            setProblemBankError("Problem title and statement are required.");
            return;
        }
        if (!eventId) {
            setProblemBankError("Please select an event.");
            return;
        }

        setProblemSaving(true);
        setProblemBankError("");
        try {
            const payload = {
                title,
                statement,
                eventId,
                sampleInput: String(problemForm.sampleInput || ""),
                sampleOutput: String(problemForm.sampleOutput || ""),
                expectedOutput: String(problemForm.expectedOutput || "").trim() || "Expected output format",
                difficulty: String(problemForm.difficulty || "medium"),
                totalPoints: Number(problemForm.totalPoints || 100),
                passingThreshold: Number(problemForm.passingThreshold || 100),
                tags: String(problemForm.tagsText || "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                isCompetitive: Boolean(problemForm.isCompetitive),
                isActive: Boolean(problemForm.isActive),
                testCases: [
                    {
                        name: "Sample Case",
                        input: String(problemForm.sampleInput || ""),
                        expectedOutput:
                            String(problemForm.sampleOutput || "").trim() ||
                            String(problemForm.expectedOutput || "").trim() ||
                            "Output",
                        isHidden: false,
                        order: 0,
                        weight: 1,
                    },
                ],
            };

            if (editingProblemId) {
                await updateProblem(editingProblemId, payload);
                setQuickMessage("Problem updated successfully.");
            } else {
                await createProblem(payload);
                setQuickMessage("Problem created successfully.");
            }

            await Promise.all([loadProblemBank(1, problemPageSize, problemEventFilter), loadOverview()]);
            resetProblemForm();
        } catch (err) {
            setProblemBankError(err?.response?.data?.error || err?.message || "Unable to save problem");
        } finally {
            setProblemSaving(false);
        }
    };

    const groupedProblems = useMemo(() => {
        const groups = new Map();

        for (const problem of displayedProblems) {
            const eventId = String(problem?.event?.id || problem?.eventId || "");
            const eventTitle = resolveProblemEventTitle(problem);
            const key = eventId || eventTitle;

            if (!groups.has(key)) {
                groups.set(key, {
                    eventId,
                    eventTitle,
                    problems: [],
                });
            }

            groups.get(key).problems.push(problem);
        }

        return Array.from(groups.values());
    }, [displayedProblems, problemEvents]);

    const handleArchiveProblem = async (problemId) => {
        setProblemSaving(true);
        setProblemBankError("");
        try {
            await archiveProblem(problemId);
            if (editingProblemId === String(problemId)) {
                resetProblemForm();
            }
            await Promise.all([loadProblemBank(1, problemPageSize, problemEventFilter), loadOverview()]);
            setQuickMessage("Problem archived successfully.");
        } catch (err) {
            setProblemBankError(err?.response?.data?.error || err?.message || "Unable to archive problem");
        } finally {
            setProblemSaving(false);
        }
    };

    const handleBulkImportFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setBulkImportFile(file);
        setProblemBankError("");
        setBulkImportPreview([]);

        try {
            const content = await parseFileContent(file);
            let problems = [];

            if (file.name.endsWith(".json")) {
                problems = parseJsonImportFile(content);
            } else if (file.name.endsWith(".csv")) {
                problems = parseCsvImportFile(content);
            } else {
                throw new Error("File must be .csv or .json");
            }

            setBulkImportPreview(problems.slice(0, 5)); // Show first 5 for preview
            setProblemBankError("");
        } catch (err) {
            setProblemBankError(err?.message || "Error parsing file");
            setBulkImportPreview([]);
        }
    };

    const handleBulkImportConfirm = async () => {
        if (!bulkImportFile || bulkImportPreview.length === 0) {
            setProblemBankError("No valid problems to import");
            return;
        }

        setBulkImportLoading(true);
        setProblemBankError("");

        try {
            const content = await parseFileContent(bulkImportFile);
            let problems = [];

            if (bulkImportFile.name.endsWith(".json")) {
                problems = parseJsonImportFile(content);
            } else if (bulkImportFile.name.endsWith(".csv")) {
                problems = parseCsvImportFile(content);
            }

            const normalizedProblems = problems.map((problem) => {
                const eventId = String(problem?.eventId || problem?.event?.id || bulkImportEventId || "").trim();
                if (!eventId) {
                    throw new Error("Please select an event for bulk import or include eventId in each record.");
                }
                return {
                    ...problem,
                    eventId,
                };
            });

            const result = await bulkImportProblems(normalizedProblems, bulkImportConflictMode);
            setBulkImportResults(result);
            setQuickMessage(
                `Import completed: ${result.imported.length} imported, ${result.skipped.length} skipped, ${result.failed.length} failed`,
            );

            // Reload problem bank
            await loadProblemBank(1, problemPageSize);

            // Close modal after a delay
            setTimeout(() => {
                setShowBulkImportModal(false);
                setBulkImportFile(null);
                setBulkImportEventId("");
                setBulkImportPreview([]);
                setBulkImportResults(null);
            }, 2000);
        } catch (err) {
            setProblemBankError(err?.message || "Error during bulk import");
        } finally {
            setBulkImportLoading(false);
        }
    };

    const handleBulkImportCancel = () => {
        setShowBulkImportModal(false);
        setBulkImportFile(null);
        setBulkImportEventId("");
        setBulkImportPreview([]);
        setBulkImportResults(null);
        setProblemBankError("");
    };

    const handleEventSubmit = async (event) => {
        event.preventDefault();
        setIsSavingEvent(true);
        setEventError("");
        try {
            const payload = {
                title: eventForm.title,
                description: eventForm.description,
                startAt: eventForm.startAt,
                endAt: eventForm.endAt,
            };
            if (editingEventId) {
                await updateAdminEvent(editingEventId, payload);
            } else {
                await createAdminEvent(payload);
            }
            await Promise.all([loadOverview(), loadEvents(eventScope), loadAdminOpsData()]);
            resetEventForm();
        } catch (err) {
            setEventError(
                err?.response?.data?.warning
                || err?.response?.data?.error
                || err?.message
                || "Unable to save event"
            );
        } finally {
            setIsSavingEvent(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        try {
            await deleteAdminEvent(eventId);
            await Promise.all([loadOverview(), loadEvents(eventScope), loadAdminOpsData()]);
            if (editingEventId === eventId) {
                resetEventForm();
            }
        } catch (err) {
            setEventError(err?.response?.data?.error || err?.message || "Unable to delete event");
        }
    };

    const handleCopyEventCode = async (eventCode) => {
        const code = String(eventCode || "").trim();
        if (!code) {
            setQuickError("Event code is unavailable for this event.");
            return;
        }

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(code);
                setQuickError("");
                setQuickMessage(`Event code copied: ${code}`);
                return;
            }
            throw new Error("Clipboard API unavailable");
        } catch {
            setQuickError("Unable to copy automatically. Please copy the code manually.");
        }
    };

    const handleFreezeToggle = async (student) => {
        if (!student.isFrozen) {
            setFreezeModalStudent(student);
            setFreezeReason("");
            return;
        }

        try {
            setQuickError("");
            setQuickMessage("");
            await setStudentFreeze(student.id, false, "");
            await Promise.all([loadOverview(), loadAdminOpsData()]);
            setQuickMessage(`Unfroze ${student.email}`);
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to update freeze state");
        }
    };

    const confirmFreezeWithReason = async () => {
        try {
            if (!freezeModalStudent) return;
            const reason = freezeReason.trim();
            if (!reason) {
                setQuickError("Freeze reason is required.");
                return;
            }

            setQuickError("");
            setQuickMessage("");
            await setStudentFreeze(freezeModalStudent.id, true, reason);
            await Promise.all([loadOverview(), loadAdminOpsData()]);
            setQuickMessage(`Froze ${freezeModalStudent.email}`);
            setFreezeModalStudent(null);
            setFreezeReason("");
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to freeze student");
        }
    };

    const handleForcePasswordReset = async (student) => {
        try {
            setQuickError("");
            const data = await forceStudentPasswordReset(student.id);
            await loadAdminOpsData();
            setQuickMessage(`Temp password for ${student.email}: ${data?.tempPassword || "generated"}`);
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to force password reset");
        }
    };

    const handleReviewRoleRequest = async (requestId, decision) => {
        try {
            setQuickError("");
            setQuickMessage("");
            await reviewRoleChangeRequest(requestId, { decision });
            await Promise.all([loadOverview(), loadAdminOpsData()]);
            setQuickMessage(`Role request ${decision}.`);
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to review role request");
        }
    };

    const handleAttendanceUpsert = async (event) => {
        event.preventDefault();
        try {
            setQuickError("");
            setQuickMessage("");
            if (!attendanceEventId || !attendanceUserId) {
                setQuickError("Select event and student for attendance update.");
                return;
            }
            await upsertEventAttendance(attendanceEventId, {
                userId: attendanceUserId,
                status: attendanceStatus,
            });
            await loadAdminOpsData();
            setQuickMessage("Attendance updated successfully.");
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to update attendance");
        }
    };

    const handleBulkCsvSelect = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();
            const lines = String(content || "")
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);

            if (lines.length < 2) {
                setQuickError("CSV must include header and at least one data row.");
                return;
            }

            const headers = parseCsvLine(lines[0]).map((h) => String(h || "").trim());
            const parsedRows = lines.slice(1).map((line) => {
                const cols = parseCsvLine(line);
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = cols[idx] ?? "";
                });
                return row;
            });

            setBulkRows(parsedRows);
            setBulkCsvFileName(file.name);
            setBulkResult(null);
            setQuickError("");
            setQuickMessage(`Parsed ${parsedRows.length} rows from ${file.name}`);
        } catch (err) {
            setQuickError(err?.message || "Unable to parse CSV file");
        }
    };

    const handleBulkAttendanceUpload = async () => {
        try {
            if (!bulkRows.length) {
                setQuickError("Select a CSV file first.");
                return;
            }
            setBulkProcessing(true);
            setQuickError("");
            setQuickMessage("");

            const result = await bulkUpsertEventAttendance(bulkRows);
            setBulkResult(result);
            await loadAdminOpsData();
            setQuickMessage(`Bulk upload complete. Processed: ${result?.processed || 0}, Failed: ${result?.failed || 0}`);
        } catch (err) {
            setQuickError(err?.response?.data?.error || err?.message || "Unable to upload attendance CSV");
        } finally {
            setBulkProcessing(false);
        }
    };

    const openStudentProfile = async (student) => {
        setProfileStudent(student);
        setProfileLoading(true);
        setProfileError("");
        setProfileSubmissions([]);

        try {
            const data = await fetchUserSubmissions(student.id);
            setProfileSubmissions(data?.submissions || []);
        } catch (err) {
            setProfileError(err?.response?.data?.error || err?.message || "Unable to load profile details");
        } finally {
            setProfileLoading(false);
        }
    };

    const closeStudentProfile = () => {
        setProfileStudent(null);
        setProfileSubmissions([]);
        setProfileLoading(false);
        setProfileError("");
    };

    const loadEventResultsPanel = async (eventId) => {
        if (!eventId) {
            setResultLeaderboard(null);
            setResultError("");
            return;
        }

        setResultLoading(true);
        setResultError("");
        try {
            const data = await fetchAdminEventResults(eventId);
            setResultLeaderboard(data?.leaderboard || null);
        } catch (err) {
            setResultError(err?.response?.data?.error || err?.message || "Unable to fetch event results");
        } finally {
            setResultLoading(false);
        }
    };

    const loadSelectionPanel = async (eventId, page = 1) => {
        if (!eventId) {
            setSelectionRows([]);
            setSelectionError("");
            setSelectionPage(1);
            setSelectionTotal(0);
            setSelectionTotalPages(0);
            return;
        }

        setSelectionLoading(true);
        setSelectionError("");
        try {
            const data = await fetchAdminEventProblemSelections(eventId, page, selectionLimit);
            setSelectionRows(data?.selections || []);
            setSelectionPage(data?.page || page);
            setSelectionTotal(data?.total || 0);
            setSelectionTotalPages(data?.totalPages || 0);
        } catch (err) {
            setSelectionError(err?.response?.data?.error || err?.message || "Unable to fetch event problem selections");
        } finally {
            setSelectionLoading(false);
        }
    };

    const handleComputeResults = async () => {
        if (!resultEventId) {
            setResultError("Select an event first.");
            return;
        }
        setResultLoading(true);
        setResultError("");
        try {
            await computeAdminEventResults(resultEventId);
            await loadEventResultsPanel(resultEventId);
            setQuickMessage("Event results computed successfully.");
        } catch (err) {
            setResultError(err?.response?.data?.error || err?.message || "Unable to compute results");
        } finally {
            setResultLoading(false);
        }
    };

    const handleFinalizeResults = async () => {
        if (!resultEventId) {
            setResultError("Select an event first.");
            return;
        }
        setResultLoading(true);
        setResultError("");
        try {
            await finalizeAdminEventResults(resultEventId);
            await loadEventResultsPanel(resultEventId);
            setQuickMessage("Event leaderboard finalized and published.");
        } catch (err) {
            setResultError(err?.response?.data?.error || err?.message || "Unable to finalize results");
        } finally {
            setResultLoading(false);
        }
    };

    const handleAdminUnlockSelection = async (userId) => {
        const reason = String(unlockReasonByUser?.[userId] || "").trim();
        if (!selectionEventId) {
            setSelectionError("Select an event first.");
            return;
        }
        if (!reason) {
            setSelectionError("Unlock reason is required.");
            return;
        }

        setUnlockingUserId(userId);
        setSelectionError("");
        try {
            await adminUnlockEventProblemSelection(selectionEventId, userId, reason);
            setUnlockReasonByUser((prev) => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
            await Promise.all([
                loadSelectionPanel(selectionEventId, selectionPage),
                loadEventResultsPanel(resultEventId),
            ]);
            setQuickMessage("Problem selection unlocked by admin.");
        } catch (err) {
            setSelectionError(err?.response?.data?.error || err?.message || "Unable to unlock selection");
        } finally {
            setUnlockingUserId("");
        }
    };

    const loadPrizePanel = async (eventId) => {
        if (!eventId) {
            setEventPrizes([]);
            setPrizeAllocations([]);
            setPrizeError("");
            return;
        }
        setPrizeLoading(true);
        setPrizeError("");
        try {
            const [prizeData, allocationData] = await Promise.all([
                fetchEventPrizes(eventId),
                fetchEventPrizeAllocations(eventId),
            ]);
            setEventPrizes(prizeData?.prizes || []);
            setPrizeAllocations(allocationData?.allocations || []);
        } catch (err) {
            setPrizeError(err?.response?.data?.error || err?.message || "Unable to fetch prize data");
        } finally {
            setPrizeLoading(false);
        }
    };

    const handleCreatePrize = async (event) => {
        event.preventDefault();
        if (!prizeEventId) {
            setPrizeError("Select an event first.");
            return;
        }
        setPrizeLoading(true);
        setPrizeError("");
        try {
            await createEventPrize(prizeEventId, {
                title: prizeForm.title,
                description: prizeForm.description,
                kind: prizeForm.kind,
                rankFrom: Number(prizeForm.rankFrom),
                rankTo: Number(prizeForm.rankTo),
                amount: prizeForm.amount === "" ? null : Number(prizeForm.amount),
                currency: prizeForm.currency,
                maxRecipients: Number(prizeForm.maxRecipients || 1),
            });
            await loadPrizePanel(prizeEventId);
            setPrizeForm((prev) => ({
                ...prev,
                title: "",
                description: "",
                amount: "",
            }));
            setQuickMessage("Prize created successfully.");
        } catch (err) {
            setPrizeError(err?.response?.data?.error || err?.message || "Unable to create prize");
        } finally {
            setPrizeLoading(false);
        }
    };

    const handleAllocatePrizes = async () => {
        if (!prizeEventId) {
            setPrizeError("Select an event first.");
            return;
        }
        setPrizeLoading(true);
        setPrizeError("");
        try {
            await allocateEventPrizes(prizeEventId);
            await loadPrizePanel(prizeEventId);
            setQuickMessage("Prize allocation completed.");
        } catch (err) {
            setPrizeError(err?.response?.data?.error || err?.message || "Unable to allocate prizes");
        } finally {
            setPrizeLoading(false);
        }
    };

    const handleDeliverPrize = async (allocationId) => {
        setPrizeLoading(true);
        setPrizeError("");
        try {
            await deliverPrizeAllocation(allocationId, { note: "Delivered by admin" });
            await loadPrizePanel(prizeEventId);
            setQuickMessage("Prize marked as delivered.");
        } catch (err) {
            setPrizeError(err?.response?.data?.error || err?.message || "Unable to update prize delivery status");
        } finally {
            setPrizeLoading(false);
        }
    };

    const loadCertificatePanel = async (eventId) => {
        if (!eventId) {
            setCertificateTemplates([]);
            setIssuedCertificates([]);
            setCertificateError("");
            return;
        }

        setCertificateLoading(true);
        setCertificateError("");
        try {
            const [templatesData, certsData] = await Promise.all([
                fetchCertificateTemplates(eventId),
                fetchEventCertificates(eventId),
            ]);
            const templates = templatesData?.templates || [];
            setCertificateTemplates(templates);
            setIssuedCertificates(certsData?.certificates || []);
            if (templates.length) {
                const defaultTemplate = templates.find((item) => item.isDefault) || templates[0];
                setSelectedTemplateId(defaultTemplate?.id || "");
            } else {
                setSelectedTemplateId("");
            }
        } catch (err) {
            setCertificateError(err?.response?.data?.error || err?.message || "Unable to fetch certificate data");
        } finally {
            setCertificateLoading(false);
        }
    };

    const handleCreateTemplate = async (event) => {
        event.preventDefault();
        if (!certificateEventId) {
            setCertificateError("Select an event first.");
            return;
        }

        setCertificateLoading(true);
        setCertificateError("");
        try {
            await createCertificateTemplate(certificateEventId, {
                name: templateForm.name,
                templateText: templateForm.templateText,
                isDefault: Boolean(templateForm.isDefault),
            });
            await loadCertificatePanel(certificateEventId);
            setTemplateForm((prev) => ({
                ...prev,
                name: "",
            }));
            setQuickMessage("Certificate template created.");
        } catch (err) {
            setCertificateError(err?.response?.data?.error || err?.message || "Unable to create certificate template");
        } finally {
            setCertificateLoading(false);
        }
    };

    const handleIssueCertificates = async () => {
        if (!certificateEventId) {
            setCertificateError("Select an event first.");
            return;
        }

        setCertificateLoading(true);
        setCertificateError("");
        try {
            await issueEventCertificates(certificateEventId, {
                templateId: selectedTemplateId || undefined,
            });
            await loadCertificatePanel(certificateEventId);
            setQuickMessage("Certificates issued successfully.");
        } catch (err) {
            setCertificateError(err?.response?.data?.error || err?.message || "Unable to issue certificates");
        } finally {
            setCertificateLoading(false);
        }
    };

    const loadCertificateAssets = async () => {
        setAssetError("");
        try {
            const data = await fetchAdminCertificateAssets();
            if (data?.assets) {
                setCertificateAssets({ ...DEFAULT_CERTIFICATE_ASSETS, ...data.assets });
            }
        } catch (err) {
            setAssetError(err?.response?.data?.error || err?.message || "Unable to load certificate assets");
        }
    };

    const handleUploadCertificateAsset = async (key, file) => {
        if (!file) return;
        setAssetUploadingKey(key);
        setAssetError("");
        try {
            const optimized = await optimizeAssetFile(file, key);
            const data = await uploadAdminCertificateAsset(key, {
                fileName: optimized.fileName,
                dataUrl: optimized.dataUrl,
            });
            if (data?.assets) {
                setCertificateAssets({ ...DEFAULT_CERTIFICATE_ASSETS, ...data.assets });
            }
            const kb = Math.max(1, Math.round(Number(optimized.bytes || 0) / 1024));
            const sizeLabel = optimized.width && optimized.height
                ? `${optimized.width}x${optimized.height}`
                : "optimized";
            setQuickMessage(`${key} asset updated successfully (${kb} KB, ${sizeLabel}).`);
        } catch (err) {
            setAssetError(err?.response?.data?.error || err?.message || "Unable to upload asset");
        } finally {
            setAssetUploadingKey("");
        }
    };

    const handleResetCertificateAssets = async () => {
        setAssetUploadingKey("reset");
        setAssetError("");
        try {
            const data = await resetAdminCertificateAssets();
            setCertificateAssets({ ...DEFAULT_CERTIFICATE_ASSETS, ...(data?.assets || {}) });
            setQuickMessage("Certificate assets reset to defaults.");
        } catch (err) {
            setAssetError(err?.response?.data?.error || err?.message || "Unable to reset certificate assets");
        } finally {
            setAssetUploadingKey("");
        }
    };

    useEffect(() => {
        loadEventResultsPanel(resultEventId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resultEventId]);

    useEffect(() => {
        loadSelectionPanel(selectionEventId, 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectionEventId]);

    useEffect(() => {
        loadPrizePanel(prizeEventId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prizeEventId]);

    useEffect(() => {
        loadCertificatePanel(certificateEventId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [certificateEventId]);

    useEffect(() => {
        loadCertificateAssets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-7xl rounded-2xl border border-cyan-500/20 bg-black/40 p-6">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="mt-2 text-sm text-white/70">
                    Logged in as {currentUser?.name || "Admin"} ({currentUser?.email})
                </p>

                {loading ? (
                    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                        Loading admin overview...
                    </div>
                ) : error ? (
                    <div className="mt-6 rounded-xl border border-red-400/40 bg-red-500/10 p-5 text-sm text-red-100">
                        {error}
                    </div>
                ) : (
                    <>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {summaryCards.map((card) => (
                                <div key={card.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">{card.label}</p>
                                    <p className="mt-1 text-xl font-semibold text-white">{card.value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {statusItems.map((item) => (
                                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-sm text-white/70">{item.label}</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">Problem Bank Management</h2>
                                    <p className="mt-1 text-sm text-white/70">
                                        Centralized admin control for creating, searching, filtering, editing and archiving problem statements.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkImportModal(true)}
                                        className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                                    >
                                        📤 Bulk Import
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetProblemForm}
                                        className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80"
                                    >
                                        New Problem
                                    </button>
                                </div>
                            </div>

                            <form onSubmit={handleSaveProblem} className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-black/30 p-3 sm:grid-cols-2">
                                <input
                                    name="title"
                                    value={problemForm.title}
                                    onChange={handleProblemFormChange}
                                    placeholder="Problem title"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <select
                                    name="difficulty"
                                    value={problemForm.difficulty}
                                    onChange={handleProblemFormChange}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="easy" style={{ color: "#000" }}>easy</option>
                                    <option value="medium" style={{ color: "#000" }}>medium</option>
                                    <option value="hard" style={{ color: "#000" }}>hard</option>
                                </select>
                                <select
                                    name="eventId"
                                    value={problemForm.eventId}
                                    onChange={handleProblemFormChange}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>Select event</option>
                                    {problemEvents.map((evt) => (
                                        <option key={evt.id} value={evt.id} style={{ color: "#000" }}>
                                            {evt.title}
                                        </option>
                                    ))}
                                </select>
                                <textarea
                                    name="statement"
                                    value={problemForm.statement}
                                    onChange={handleProblemFormChange}
                                    rows={4}
                                    placeholder="Problem statement"
                                    className="sm:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    name="sampleInput"
                                    value={problemForm.sampleInput}
                                    onChange={handleProblemFormChange}
                                    placeholder="Sample input"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    name="sampleOutput"
                                    value={problemForm.sampleOutput}
                                    onChange={handleProblemFormChange}
                                    placeholder="Sample output"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    name="expectedOutput"
                                    value={problemForm.expectedOutput}
                                    onChange={handleProblemFormChange}
                                    placeholder="Expected output format"
                                    className="sm:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    type="number"
                                    min="1"
                                    name="totalPoints"
                                    value={problemForm.totalPoints}
                                    onChange={handleProblemFormChange}
                                    placeholder="Total points"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    name="passingThreshold"
                                    value={problemForm.passingThreshold}
                                    onChange={handleProblemFormChange}
                                    placeholder="Passing threshold"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <input
                                    name="tagsText"
                                    value={problemForm.tagsText}
                                    onChange={handleProblemFormChange}
                                    placeholder="Tags (comma separated)"
                                    className="sm:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />

                                <label className="flex items-center gap-2 text-xs text-white/80">
                                    <input
                                        type="checkbox"
                                        name="isCompetitive"
                                        checked={problemForm.isCompetitive}
                                        onChange={handleProblemFormChange}
                                    />
                                    Competitive problem
                                </label>
                                <label className="flex items-center gap-2 text-xs text-white/80">
                                    <input
                                        type="checkbox"
                                        name="isActive"
                                        checked={problemForm.isActive}
                                        onChange={handleProblemFormChange}
                                    />
                                    Active
                                </label>

                                <div className="sm:col-span-2 flex flex-wrap gap-2">
                                    <button
                                        type="submit"
                                        disabled={problemSaving || !problemForm.eventId}
                                        className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
                                    >
                                        {problemSaving
                                            ? "Saving..."
                                            : editingProblemId
                                                ? "Update Problem"
                                                : "Create Problem"}
                                    </button>
                                    {editingProblemId && (
                                        <button
                                            type="button"
                                            onClick={resetProblemForm}
                                            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/85"
                                        >
                                            Cancel Edit
                                        </button>
                                    )}
                                </div>
                            </form>

                            <div className="mt-4 grid gap-2 sm:grid-cols-4">
                                <input
                                    value={problemSearch}
                                    onChange={(e) => setProblemSearch(e.target.value)}
                                    placeholder="Search by title or tags"
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                />
                                <select
                                    value={problemDifficultyFilter}
                                    onChange={(e) => setProblemDifficultyFilter(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="all" style={{ color: "#000" }}>All difficulties</option>
                                    <option value="easy" style={{ color: "#000" }}>easy</option>
                                    <option value="medium" style={{ color: "#000" }}>medium</option>
                                    <option value="hard" style={{ color: "#000" }}>hard</option>
                                </select>
                                <select
                                    value={problemStatusFilter}
                                    onChange={(e) => setProblemStatusFilter(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="all" style={{ color: "#000" }}>All statuses</option>
                                    <option value="active" style={{ color: "#000" }}>Active only</option>
                                    <option value="archived" style={{ color: "#000" }}>Archived only</option>
                                </select>
                                <select
                                    value={problemEventFilter}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setProblemEventFilter(value);
                                        void loadProblemBank(1, problemPageSize, value);
                                    }}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>All events</option>
                                    {problemEvents.map((evt) => (
                                        <option key={evt.id} value={evt.id} style={{ color: "#000" }}>
                                            {evt.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {problemBankError && (
                                <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                    {problemBankError}
                                </p>
                            )}

                            <div className="mt-4 space-y-4">
                                {problemBankLoading ? (
                                    <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                                        Loading problem bank...
                                    </div>
                                ) : groupedProblems.length === 0 ? (
                                    <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                                        No problems found.
                                    </div>
                                ) : (
                                    groupedProblems.map((group) => (
                                        <div key={group.eventId || group.eventTitle} className="rounded-xl border border-white/10 bg-black/30 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <h3 className="text-sm font-semibold text-white">{group.eventTitle}</h3>
                                                    <p className="mt-1 text-xs text-white/60">{group.problems.length} problem(s)</p>
                                                </div>
                                                {group.eventId && (
                                                    <span className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/60">
                                                        {group.eventId}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-3 overflow-x-auto">
                                                <table className="w-full min-w-[1080px] text-left text-sm">
                                                    <thead className="text-white/60">
                                                        <tr>
                                                            <th className="py-2 pr-3">Event</th>
                                                            <th className="py-2 pr-3">Title</th>
                                                            <th className="py-2 pr-3">Difficulty</th>
                                                            <th className="py-2 pr-3">Points</th>
                                                            <th className="py-2 pr-3">Threshold</th>
                                                            <th className="py-2 pr-3">Tags</th>
                                                            <th className="py-2 pr-3">Status</th>
                                                            <th className="py-2 pr-3">Updated</th>
                                                            <th className="py-2 pr-3">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {group.problems.map((problem) => (
                                                            <tr key={problem.id} className="border-t border-white/10">
                                                                <td className="py-2 pr-3 text-white/80">{resolveProblemEventTitle(problem)}</td>
                                                                <td className="py-2 pr-3 text-white">{problem.title}</td>
                                                                <td className="py-2 pr-3 text-white/80">{problem.difficulty}</td>
                                                                <td className="py-2 pr-3 text-white/80">{problem.totalPoints}</td>
                                                                <td className="py-2 pr-3 text-white/80">{problem.passingThreshold}%</td>
                                                                <td className="py-2 pr-3 text-white/70">{(problem.tags || []).join(", ") || "-"}</td>
                                                                <td className="py-2 pr-3 text-white/80">{problem.isActive ? "active" : "archived"}</td>
                                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(problem.updatedAt)}</td>
                                                                <td className="py-2 pr-3">
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleEditProblem(problem)}
                                                                            className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        {problem.isActive && (
                                                                            <button
                                                                                type="button"
                                                                                disabled={problemSaving}
                                                                                onClick={() => handleArchiveProblem(problem.id)}
                                                                                className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200 disabled:opacity-70"
                                                                            >
                                                                                Archive
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="mt-3 flex items-center justify-between text-xs text-white/70">
                                <p>
                                    Showing {(problemTotalCount === 0 ? 0 : ((problemPage - 1) * problemPageSize) + 1)}-
                                    {Math.min(problemPage * problemPageSize, problemTotalCount)} of {problemTotalCount}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={problemPage <= 1 || problemBankLoading}
                                        onClick={() => loadProblemBank(problemPage - 1, problemPageSize)}
                                        className="rounded border border-white/20 px-2 py-1 text-white/85 disabled:opacity-40"
                                    >
                                        Prev
                                    </button>
                                    <span>Page {problemPage} / {problemTotalPages}</span>
                                    <button
                                        type="button"
                                        disabled={problemPage >= problemTotalPages || problemBankLoading}
                                        onClick={() => loadProblemBank(problemPage + 1, problemPageSize)}
                                        className="rounded border border-white/20 px-2 py-1 text-white/85 disabled:opacity-40"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Current Events</h2>
                                <p className="mt-2 text-sm text-white/70">Events currently active in timeline.</p>
                                <p className="mt-3 text-3xl font-bold text-cyan-300">
                                    {overview?.events?.history?.currentCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Past Events</h2>
                                <p className="mt-2 text-sm text-white/70">Events that already ended.</p>
                                <p className="mt-3 text-3xl font-bold text-amber-300">
                                    {overview?.events?.history?.pastCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Future Events</h2>
                                <p className="mt-2 text-sm text-white/70">Scheduled events in upcoming timeline.</p>
                                <p className="mt-3 text-3xl font-bold text-emerald-300">
                                    {overview?.events?.history?.futureCount ?? 0}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Event Scheduler</h2>
                                <p className="mt-1 text-sm text-white/70">
                                    Create or update real future events with start/end time.
                                </p>
                                <form onSubmit={handleEventSubmit} className="mt-4 space-y-3">
                                    <div>
                                        <label className="mb-1 block text-xs uppercase tracking-widest text-cyan-300">Title</label>
                                        <input
                                            name="title"
                                            value={eventForm.title}
                                            onChange={handleEventFormChange}
                                            placeholder="Weekly contest"
                                            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs uppercase tracking-widest text-cyan-300">Description</label>
                                        <textarea
                                            name="description"
                                            value={eventForm.description}
                                            onChange={handleEventFormChange}
                                            rows={3}
                                            placeholder="Contest details, rules, notes..."
                                            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                                        />
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-xs uppercase tracking-widest text-cyan-300">Start</label>
                                            <input
                                                type="datetime-local"
                                                name="startAt"
                                                value={eventForm.startAt}
                                                onChange={handleEventFormChange}
                                                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs uppercase tracking-widest text-cyan-300">End</label>
                                            <input
                                                type="datetime-local"
                                                name="endAt"
                                                value={eventForm.endAt}
                                                onChange={handleEventFormChange}
                                                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                                            />
                                        </div>
                                    </div>

                                    {eventError && (
                                        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                            {eventError}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="submit"
                                            disabled={isSavingEvent}
                                            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
                                        >
                                            {isSavingEvent
                                                ? (editingEventId ? "Updating..." : "Creating...")
                                                : (editingEventId ? "Update Event" : "Create Event")}
                                        </button>
                                        {editingEventId && (
                                            <button
                                                type="button"
                                                onClick={resetEventForm}
                                                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
                                            >
                                                Cancel Edit
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-lg font-semibold">Scheduled Events</h2>
                                        <p className="mt-1 text-sm text-white/70">Monitor current, past, and future calendar events.</p>
                                    </div>
                                    <select
                                        value={eventScope}
                                        onChange={(e) => setEventScope(e.target.value)}
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    >
                                        <option value="future" style={{ color: "#000" }}>Future</option>
                                        <option value="current" style={{ color: "#000" }}>Current</option>
                                        <option value="past" style={{ color: "#000" }}>Past</option>
                                        <option value="all" style={{ color: "#000" }}>All</option>
                                    </select>
                                </div>

                                {eventLoading ? (
                                    <p className="mt-3 text-sm text-white/70">Loading events...</p>
                                ) : events.length === 0 ? (
                                    <p className="mt-3 text-sm text-white/70">No events found for this scope.</p>
                                ) : (
                                    <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                                        {events.map((evt) => (
                                            <div key={evt.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{evt.title}</p>
                                                        <p className="mt-1 text-xs text-white/70">{evt.description || "No description"}</p>
                                                        <p className="mt-1 text-xs text-cyan-200">{fmtDateTime(evt.startAt)} {"->"} {fmtDateTime(evt.endAt)}</p>
                                                        <p className="mt-1 text-xs text-amber-200/90">Duration: {fmtEventDuration(evt.startAt, evt.endAt)}</p>
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <span className="text-[11px] uppercase tracking-widest text-white/55">Event Code</span>
                                                            <code className="rounded bg-black/50 px-2 py-1 text-xs text-emerald-200">{evt.id}</code>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyEventCode(evt.id)}
                                                                className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/15"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => onEditEvent(evt)}
                                                            className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteEvent(evt.id)}
                                                            className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">Event Results Control</h2>
                                    <p className="mt-1 text-sm text-white/70">Compute and finalize ranked leaderboard for an event.</p>
                                </div>
                                <select
                                    value={resultEventId}
                                    onChange={(e) => setResultEventId(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>Select event</option>
                                    {events.map((evt) => (
                                        <option key={evt.id} value={evt.id} style={{ color: "#000" }}>{evt.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={resultLoading || !resultEventId}
                                    onClick={handleComputeResults}
                                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
                                >
                                    {resultLoading ? "Computing..." : "Compute Results"}
                                </button>
                                <button
                                    type="button"
                                    disabled={resultLoading || !resultEventId}
                                    onClick={handleFinalizeResults}
                                    className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-70"
                                >
                                    Finalize and Publish
                                </button>
                            </div>

                            {resultError && (
                                <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                    {resultError}
                                </p>
                            )}

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Participants</p>
                                    <p className="mt-1 text-lg font-semibold text-white">{resultLeaderboard?.stats?.totalParticipants ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Submissions</p>
                                    <p className="mt-1 text-lg font-semibold text-white">{resultLeaderboard?.stats?.totalSubmissions ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Problems</p>
                                    <p className="mt-1 text-lg font-semibold text-white">{resultLeaderboard?.stats?.totalProblems ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Status</p>
                                    <p className="mt-1 text-lg font-semibold text-white">{resultLeaderboard?.isFinal ? "Finalized" : "Draft"}</p>
                                </div>
                            </div>

                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[840px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">Rank</th>
                                            <th className="py-2 pr-3">Name</th>
                                            <th className="py-2 pr-3">Email</th>
                                            <th className="py-2 pr-3">Score</th>
                                            <th className="py-2 pr-3">%</th>
                                            <th className="py-2 pr-3">Passed</th>
                                            <th className="py-2 pr-3">Merit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(resultLeaderboard?.entries || []).slice(0, 20).map((row, index) => (
                                            <tr key={`${row.userId}-${index}`} className="border-t border-white/10">
                                                <td className="py-2 pr-3 text-white">{row.rank}</td>
                                                <td className="py-2 pr-3 text-white">{row.userName || "-"}</td>
                                                <td className="py-2 pr-3 text-white/80">{row.userEmail || "-"}</td>
                                                <td className="py-2 pr-3 text-white/80">{row.totalScore}/{row.totalPossibleScore}</td>
                                                <td className="py-2 pr-3 text-white/80">{row.percentage}%</td>
                                                <td className="py-2 pr-3 text-white/80">{row.passedProblems}</td>
                                                <td className="py-2 pr-3 text-white/80">{row.merit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 xl:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 xl:col-span-2">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold">Event Problem Selections</h2>
                                        <p className="mt-1 text-sm text-white/70">View locked student selections per event and unlock with mandatory reason.</p>
                                    </div>
                                    <select
                                        value={selectionEventId}
                                        onChange={(e) => setSelectionEventId(e.target.value)}
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    >
                                        <option value="" style={{ color: "#000" }}>Select event</option>
                                        {events.map((evt) => (
                                            <option key={evt.id} value={evt.id} style={{ color: "#000" }}>{evt.title}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectionError && (
                                    <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                        {selectionError}
                                    </p>
                                )}

                                <div className="mt-4 overflow-x-auto">
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead className="text-white/60">
                                            <tr>
                                                <th className="py-2 pr-3">Student</th>
                                                <th className="py-2 pr-3">Email</th>
                                                <th className="py-2 pr-3">Problem</th>
                                                <th className="py-2 pr-3">Locked At</th>
                                                <th className="py-2 pr-3">Unlock Reason</th>
                                                <th className="py-2 pr-3">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectionLoading ? (
                                                <tr className="border-t border-white/10">
                                                    <td colSpan={6} className="py-3 text-white/70">Loading locked selections...</td>
                                                </tr>
                                            ) : selectionRows.length === 0 ? (
                                                <tr className="border-t border-white/10">
                                                    <td colSpan={6} className="py-3 text-white/70">No locked selections found for selected event.</td>
                                                </tr>
                                            ) : (
                                                selectionRows.map((row) => {
                                                    const userId = String(row?.user?.id || "");
                                                    return (
                                                        <tr key={row.id} className="border-t border-white/10">
                                                            <td className="py-2 pr-3 text-white">{row?.user?.name || "-"}</td>
                                                            <td className="py-2 pr-3 text-white/80">{row?.user?.email || "-"}</td>
                                                            <td className="py-2 pr-3 text-white/80">{row?.problem?.title || "-"}</td>
                                                            <td className="py-2 pr-3 text-white/70">{fmtDateTime(row.lockedAt)}</td>
                                                            <td className="py-2 pr-3">
                                                                <input
                                                                    value={unlockReasonByUser?.[userId] || ""}
                                                                    onChange={(e) => setUnlockReasonByUser((prev) => ({
                                                                        ...prev,
                                                                        [userId]: e.target.value,
                                                                    }))}
                                                                    placeholder="Reason required"
                                                                    className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white outline-none"
                                                                />
                                                            </td>
                                                            <td className="py-2 pr-3">
                                                                <button
                                                                    type="button"
                                                                    disabled={unlockingUserId === userId}
                                                                    onClick={() => handleAdminUnlockSelection(userId)}
                                                                    className="rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-200 disabled:opacity-60"
                                                                >
                                                                    {unlockingUserId === userId ? "Unlocking..." : "Unlock"}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-3 flex items-center justify-between text-xs text-white/70">
                                    <p>
                                        Showing {(selectionTotal === 0 ? 0 : ((selectionPage - 1) * selectionLimit) + 1)}-
                                        {Math.min(selectionPage * selectionLimit, selectionTotal)} of {selectionTotal}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={selectionLoading || selectionPage <= 1}
                                            onClick={() => loadSelectionPanel(selectionEventId, selectionPage - 1)}
                                            className="rounded border border-white/20 px-2 py-1 text-white/85 disabled:opacity-40"
                                        >
                                            Prev
                                        </button>
                                        <span>Page {selectionPage} / {selectionTotalPages || 1}</span>
                                        <button
                                            type="button"
                                            disabled={selectionLoading || selectionPage >= Math.max(selectionTotalPages, 1)}
                                            onClick={() => loadSelectionPanel(selectionEventId, selectionPage + 1)}
                                            className="rounded border border-white/20 px-2 py-1 text-white/85 disabled:opacity-40"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold">Prize Setup and Allocation</h2>
                                        <p className="mt-1 text-sm text-white/70">Define prize slabs and allocate winners from finalized leaderboard.</p>
                                    </div>
                                    <select
                                        value={prizeEventId}
                                        onChange={(e) => setPrizeEventId(e.target.value)}
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    >
                                        <option value="" style={{ color: "#000" }}>Select event</option>
                                        {events.map((evt) => (
                                            <option key={evt.id} value={evt.id} style={{ color: "#000" }}>{evt.title}</option>
                                        ))}
                                    </select>
                                </div>

                                <form onSubmit={handleCreatePrize} className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <input
                                        value={prizeForm.title}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, title: e.target.value }))}
                                        placeholder="Prize title"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <select
                                        value={prizeForm.kind}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, kind: e.target.value }))}
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    >
                                        <option value="cash" style={{ color: "#000" }}>cash</option>
                                        <option value="voucher" style={{ color: "#000" }}>voucher</option>
                                        <option value="gift" style={{ color: "#000" }}>gift</option>
                                        <option value="custom" style={{ color: "#000" }}>custom</option>
                                    </select>
                                    <input
                                        value={prizeForm.description}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, description: e.target.value }))}
                                        placeholder="Description"
                                        className="sm:col-span-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={prizeForm.rankFrom}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, rankFrom: e.target.value }))}
                                        placeholder="Rank from"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={prizeForm.rankTo}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, rankTo: e.target.value }))}
                                        placeholder="Rank to"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        value={prizeForm.amount}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, amount: e.target.value }))}
                                        placeholder="Amount"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <input
                                        value={prizeForm.currency}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, currency: e.target.value }))}
                                        placeholder="Currency"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={prizeForm.maxRecipients}
                                        onChange={(e) => setPrizeForm((prev) => ({ ...prev, maxRecipients: e.target.value }))}
                                        placeholder="Max recipients"
                                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="submit"
                                            disabled={prizeLoading}
                                            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
                                        >
                                            Add Prize
                                        </button>
                                        <button
                                            type="button"
                                            disabled={prizeLoading || !prizeEventId}
                                            onClick={handleAllocatePrizes}
                                            className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-70"
                                        >
                                            Allocate Prizes
                                        </button>
                                    </div>
                                </form>

                                {prizeError && (
                                    <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                        {prizeError}
                                    </p>
                                )}

                                <div className="mt-4 overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-left text-sm">
                                        <thead className="text-white/60">
                                            <tr>
                                                <th className="py-2 pr-3">Title</th>
                                                <th className="py-2 pr-3">Range</th>
                                                <th className="py-2 pr-3">Kind</th>
                                                <th className="py-2 pr-3">Amount</th>
                                                <th className="py-2 pr-3">Active</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {eventPrizes.map((prize) => (
                                                <tr key={prize.id} className="border-t border-white/10">
                                                    <td className="py-2 pr-3 text-white">{prize.title}</td>
                                                    <td className="py-2 pr-3 text-white/80">#{prize.rankFrom} - #{prize.rankTo}</td>
                                                    <td className="py-2 pr-3 text-white/80">{prize.kind}</td>
                                                    <td className="py-2 pr-3 text-white/80">{prize.amount ?? "-"} {prize.currency || ""}</td>
                                                    <td className="py-2 pr-3 text-white/80">{prize.isActive ? "Yes" : "No"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h3 className="text-base font-semibold">Prize Allocation Status</h3>
                                <p className="mt-1 text-sm text-white/70">Track claims and mark delivered rewards.</p>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-left text-sm">
                                        <thead className="text-white/60">
                                            <tr>
                                                <th className="py-2 pr-3">Rank</th>
                                                <th className="py-2 pr-3">Student</th>
                                                <th className="py-2 pr-3">Prize</th>
                                                <th className="py-2 pr-3">Status</th>
                                                <th className="py-2 pr-3">Claimed At</th>
                                                <th className="py-2 pr-3">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {prizeAllocations.map((allocation) => (
                                                <tr key={allocation.id} className="border-t border-white/10">
                                                    <td className="py-2 pr-3 text-white">{allocation.rank}</td>
                                                    <td className="py-2 pr-3 text-white/80">{allocation.userId?.name || "-"}</td>
                                                    <td className="py-2 pr-3 text-white/80">{allocation.prizeId?.title || "-"}</td>
                                                    <td className="py-2 pr-3 text-white/80">{allocation.status}</td>
                                                    <td className="py-2 pr-3 text-white/70">{fmtDateTime(allocation.claimedAt)}</td>
                                                    <td className="py-2 pr-3">
                                                        <button
                                                            type="button"
                                                            disabled={allocation.status === "delivered" || prizeLoading}
                                                            onClick={() => handleDeliverPrize(allocation.id)}
                                                            className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 disabled:opacity-60"
                                                        >
                                                            Mark Delivered
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">Certificate Issuance</h2>
                                    <p className="mt-1 text-sm text-white/70">Create templates and issue certificates for finalized events.</p>
                                </div>
                                <select
                                    value={certificateEventId}
                                    onChange={(e) => setCertificateEventId(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>Select event</option>
                                    {events.map((evt) => (
                                        <option key={evt.id} value={evt.id} style={{ color: "#000" }}>{evt.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <form onSubmit={handleCreateTemplate} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-sm font-semibold text-white">Template Builder</p>
                                    <input
                                        value={templateForm.name}
                                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="Template name"
                                        className="mt-3 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <textarea
                                        rows={5}
                                        value={templateForm.templateText}
                                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateText: e.target.value }))}
                                        className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    />
                                    <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
                                        <input
                                            type="checkbox"
                                            checked={templateForm.isDefault}
                                            onChange={(e) => setTemplateForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                                        />
                                        Set as default template
                                    </label>
                                    <button
                                        type="submit"
                                        disabled={certificateLoading}
                                        className="mt-3 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
                                    >
                                        Save Template
                                    </button>
                                </form>

                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-sm font-semibold text-white">Issue Certificates</p>
                                    <p className="mt-1 text-xs text-white/65">Choose template and issue for current finalized leaderboard.</p>
                                    <select
                                        value={selectedTemplateId}
                                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                                        className="mt-3 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                    >
                                        <option value="" style={{ color: "#000" }}>Auto select default</option>
                                        {certificateTemplates.map((item) => (
                                            <option key={item.id} value={item.id} style={{ color: "#000" }}>{item.name}{item.isDefault ? " (default)" : ""}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={certificateLoading || !certificateEventId}
                                        onClick={handleIssueCertificates}
                                        className="mt-3 rounded-lg border border-emerald-400/40 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-70"
                                    >
                                        Issue Certificates
                                    </button>
                                </div>
                            </div>

                            {certificateError && (
                                <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                    {certificateError}
                                </p>
                            )}

                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[860px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">Student</th>
                                            <th className="py-2 pr-3">Event</th>
                                            <th className="py-2 pr-3">Rank</th>
                                            <th className="py-2 pr-3">Certificate No</th>
                                            <th className="py-2 pr-3">Verification Code</th>
                                            <th className="py-2 pr-3">Issued At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {issuedCertificates.map((certificate) => (
                                            <tr key={certificate.id} className="border-t border-white/10">
                                                <td className="py-2 pr-3 text-white">{certificate.userId?.name || "-"}</td>
                                                <td className="py-2 pr-3 text-white/80">{certificate.eventId?.title || "-"}</td>
                                                <td className="py-2 pr-3 text-white/80">{certificate.rank ?? "-"}</td>
                                                <td className="py-2 pr-3 text-white/80">{certificate.certificateNo}</td>
                                                <td className="py-2 pr-3 text-white/80">{certificate.verificationCode}</td>
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(certificate.issuedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">Certificate Asset Management</h2>
                                    <p className="mt-1 text-sm text-white/70">Upload or replace logo, signature scan, and official seal used in PDF certificates.</p>
                                    <p className="mt-1 text-xs text-white/60">Max file size: 2MB per asset. Large raster images are auto-compressed and center-cropped to recommended ratios before upload.</p>
                                </div>
                                <button
                                    type="button"
                                    disabled={assetUploadingKey === "reset"}
                                    onClick={handleResetCertificateAssets}
                                    className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-70"
                                >
                                    {assetUploadingKey === "reset" ? "Resetting..." : "Reset To Defaults"}
                                </button>
                            </div>

                            {assetError && (
                                <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                    {assetError}
                                </p>
                            )}

                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                                {[
                                    { key: "logo", label: "Organization Logo" },
                                    { key: "signature", label: "Signature Scan" },
                                    { key: "seal", label: "Official Seal" },
                                ].map((assetItem) => {
                                    const item = certificateAssets?.[assetItem.key] || {};
                                    const imageUrl = item?.url || DEFAULT_CERTIFICATE_ASSETS?.[assetItem.key]?.url || "";
                                    const spec = getAssetSpec(assetItem.key);
                                    return (
                                        <div key={assetItem.key} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                            <p className="text-sm font-semibold text-white">{assetItem.label}</p>
                                            <p className="mt-1 text-xs text-white/60">Recommended: {spec.label} (center crop)</p>
                                            <div className="mt-2 h-32 overflow-hidden rounded border border-white/10 bg-white/5 p-2">
                                                {imageUrl ? (
                                                    <img
                                                        src={imageUrl}
                                                        alt={assetItem.label}
                                                        className="h-full w-full object-contain"
                                                    />
                                                ) : (
                                                    <p className="text-xs text-white/60">No preview available</p>
                                                )}
                                            </div>
                                            <p className="mt-2 truncate text-xs text-white/60">{item?.fileName || "default"}</p>
                                            <label className="mt-2 inline-flex cursor-pointer items-center rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200">
                                                {assetUploadingKey === assetItem.key ? "Uploading..." : "Upload Asset"}
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                                                    className="hidden"
                                                    disabled={assetUploadingKey === assetItem.key}
                                                    onChange={(event) => {
                                                        const file = event.target.files?.[0];
                                                        void handleUploadCertificateAsset(assetItem.key, file);
                                                        event.target.value = "";
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {(quickMessage || quickError) && (
                            <div className="mt-4">
                                {quickMessage && (
                                    <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                        {quickMessage}
                                    </p>
                                )}
                                {quickError && (
                                    <p className="mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                        {quickError}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">Contest/Event Attendance Tracking</h2>
                            <p className="mt-1 text-sm text-white/70">
                                Registered vs participated vs completed stats per event.
                            </p>
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[740px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">Event</th>
                                            <th className="py-2 pr-3">Start</th>
                                            <th className="py-2 pr-3">End</th>
                                            <th className="py-2 pr-3">Registered</th>
                                            <th className="py-2 pr-3">Participated</th>
                                            <th className="py-2 pr-3">Completed</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attendanceSummary.map((item) => (
                                            <tr key={item.id} className="border-t border-white/10">
                                                <td className="py-2 pr-3 text-white">{item.title}</td>
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(item.startAt)}</td>
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(item.endAt)}</td>
                                                <td className="py-2 pr-3 text-white">{item.attendance?.registered || 0}</td>
                                                <td className="py-2 pr-3 text-white">{item.attendance?.participated || 0}</td>
                                                <td className="py-2 pr-3 text-white">{item.attendance?.completed || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <form onSubmit={handleAttendanceUpsert} className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-black/30 p-3 sm:grid-cols-4">
                                <select
                                    value={attendanceEventId}
                                    onChange={(e) => setAttendanceEventId(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>Select event</option>
                                    {attendanceSummary.map((item) => (
                                        <option key={item.id} value={item.id} style={{ color: "#000" }}>{item.title}</option>
                                    ))}
                                </select>
                                <select
                                    value={attendanceUserId}
                                    onChange={(e) => setAttendanceUserId(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="" style={{ color: "#000" }}>Select student</option>
                                    {adminStudents.map((s) => (
                                        <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name} ({s.email})</option>
                                    ))}
                                </select>
                                <select
                                    value={attendanceStatus}
                                    onChange={(e) => setAttendanceStatus(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                >
                                    <option value="registered" style={{ color: "#000" }}>registered</option>
                                    <option value="participated" style={{ color: "#000" }}>participated</option>
                                    <option value="completed" style={{ color: "#000" }}>completed</option>
                                </select>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black"
                                >
                                    Save Attendance
                                </button>
                            </form>

                            <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
                                <p className="text-sm font-semibold text-white">Bulk Upload (CSV)</p>
                                <p className="mt-1 text-xs text-white/65">
                                    Header supported: eventId,userId,status OR eventTitle,userEmail,status
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        onChange={handleBulkCsvSelect}
                                        className="text-xs text-white/80 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleBulkAttendanceUpload}
                                        disabled={bulkProcessing || !bulkRows.length}
                                        className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-70"
                                    >
                                        {bulkProcessing ? "Uploading..." : "Upload CSV"}
                                    </button>
                                    {bulkCsvFileName && (
                                        <span className="text-xs text-white/70">{bulkCsvFileName} ({bulkRows.length} rows)</span>
                                    )}
                                </div>

                                {bulkResult && (
                                    <div className="mt-3 rounded border border-white/10 bg-black/30 p-2 text-xs text-white/80">
                                        <p>Total: {bulkResult.totalRows || 0}</p>
                                        <p>Processed: {bulkResult.processed || 0}</p>
                                        <p>Failed: {bulkResult.failed || 0}</p>
                                        {Array.isArray(bulkResult.failures) && bulkResult.failures.length > 0 && (
                                            <div className="mt-2 max-h-28 overflow-auto rounded bg-black/40 p-2">
                                                {bulkResult.failures.slice(0, 10).map((f, idx) => (
                                                    <p key={`${f.row}-${idx}`}>Row {f.row}: {f.error}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Quick Controls</h2>
                                <p className="mt-1 text-sm text-white/70">
                                    Freeze/unfreeze student, force password reset.
                                </p>
                                <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
                                    {adminStudents.map((student) => (
                                        <div key={student.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{student.name}</p>
                                                    <p className="text-xs text-white/70">{student.email}</p>
                                                    <p className="text-xs text-white/60">Status: {student.isFrozen ? "Frozen" : "Active"}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleFreezeToggle(student)}
                                                        className={`rounded px-2 py-1 text-xs font-medium ${student.isFrozen
                                                            ? "border border-emerald-400/40 text-emerald-200"
                                                            : "border border-amber-400/40 text-amber-200"
                                                            }`}
                                                    >
                                                        {student.isFrozen ? "Unfreeze" : "Freeze"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleForcePasswordReset(student)}
                                                        className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                    >
                                                        Force Reset
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <h2 className="text-lg font-semibold">Role Change Requests Approval</h2>
                                <p className="mt-1 text-sm text-white/70">
                                    Approve or reject pending role change requests.
                                </p>
                                <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
                                    {roleRequests.length === 0 ? (
                                        <p className="text-sm text-white/70">No pending requests.</p>
                                    ) : (
                                        roleRequests.map((item) => (
                                            <div key={item.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                                <p className="text-sm font-semibold text-white">{item.user?.name} ({item.user?.email})</p>
                                                <p className="mt-1 text-xs text-white/70">
                                                    {item.currentRole} {"->"} {item.requestedRole}
                                                </p>
                                                <p className="mt-1 text-xs text-white/60">Reason: {item.reason || "No reason provided"}</p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReviewRoleRequest(item.id, "approved")}
                                                        className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReviewRoleRequest(item.id, "rejected")}
                                                        className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">Admin Action Audit Log</h2>
                            <p className="mt-1 text-sm text-white/70">
                                Full trace of admin changes: event updates, quick controls, approvals.
                            </p>
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[860px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">When</th>
                                            <th className="py-2 pr-3">Admin</th>
                                            <th className="py-2 pr-3">Action</th>
                                            <th className="py-2 pr-3">Target</th>
                                            <th className="py-2 pr-3">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map((log) => (
                                            <tr key={log.id} className="border-t border-white/10">
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(log.createdAt)}</td>
                                                <td className="py-2 pr-3 text-white">{log.admin?.name || "Admin"}</td>
                                                <td className="py-2 pr-3 text-white/90">{log.action}</td>
                                                <td className="py-2 pr-3 text-white/80">{log.targetType} ({log.targetId || "-"})</td>
                                                <td className="py-2 pr-3 text-white/70">{Object.entries(log.metadata || {}).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(" | ") || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">Student Monitor</h2>
                            <p className="mt-1 text-sm text-white/70">
                                All students with account age, submission volume, and acceptance rate.
                            </p>
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[860px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">Name</th>
                                            <th className="py-2 pr-3">Email</th>
                                            <th className="py-2 pr-3">Joined</th>
                                            <th className="py-2 pr-3">Submissions</th>
                                            <th className="py-2 pr-3">Accepted</th>
                                            <th className="py-2 pr-3">Acceptance %</th>
                                            <th className="py-2 pr-3">Latest Activity</th>
                                            <th className="py-2 pr-3">Profile</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(overview?.students || []).map((student) => (
                                            <tr key={student.id} className="border-t border-white/10">
                                                <td className="py-2 pr-3 font-medium text-white">{student.name}</td>
                                                <td className="py-2 pr-3 text-white/80">{student.email}</td>
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(student.createdAt)}</td>
                                                <td className="py-2 pr-3 text-white">{student.submissionCount}</td>
                                                <td className="py-2 pr-3 text-white">{student.acceptedCount}</td>
                                                <td className="py-2 pr-3 text-white">{student.acceptanceRate}%</td>
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(student.latestSubmissionAt)}</td>
                                                <td className="py-2 pr-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openStudentProfile(student)}
                                                        className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                    >
                                                        View Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-lg font-semibold">Submission History Monitor</h2>
                            <p className="mt-1 text-sm text-white/70">
                                Recent submission stream across all users.
                            </p>
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[1080px] text-left text-sm">
                                    <thead className="text-white/60">
                                        <tr>
                                            <th className="py-2 pr-3">When</th>
                                            <th className="py-2 pr-3">User</th>
                                            <th className="py-2 pr-3">Role</th>
                                            <th className="py-2 pr-3">Problem</th>
                                            <th className="py-2 pr-3">Language</th>
                                            <th className="py-2 pr-3">Status</th>
                                            <th className="py-2 pr-3">Execution</th>
                                            <th className="py-2 pr-3">Memory</th>
                                            <th className="py-2 pr-3">View</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(overview?.submissions?.recent || []).map((sub) => (
                                            <tr key={sub.id} className="border-t border-white/10">
                                                <td className="py-2 pr-3 text-white/70">{fmtDateTime(sub.createdAt)}</td>
                                                <td className="py-2 pr-3 text-white">{sub.user?.name || "Unknown"}</td>
                                                <td className="py-2 pr-3 text-white/80">{sub.user?.role || "student"}</td>
                                                <td className="py-2 pr-3 text-white/80">{sub.problem?.title || "Unknown"}</td>
                                                <td className="py-2 pr-3 text-white/80">{sub.language}</td>
                                                <td className="py-2 pr-3 text-white">{sub.status}</td>
                                                <td className="py-2 pr-3 text-white/80">{fmtMs(sub.executionTime)}</td>
                                                <td className="py-2 pr-3 text-white/80">{sub.memory ?? "-"}</td>
                                                <td className="py-2 pr-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedSubmission(sub)}
                                                        className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                                                    >
                                                        View Submission
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </>
                )}

                <div className="mt-6">
                    <Link
                        to="/compiler"
                        className="inline-flex min-h-10 items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black"
                    >
                        Open Compiler
                    </Link>
                </div>

                {freezeModalStudent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/65"
                            onClick={() => {
                                setFreezeModalStudent(null);
                                setFreezeReason("");
                            }}
                        />
                        <div className="relative z-10 w-full max-w-md rounded-xl border border-white/15 bg-gray-950 p-4 text-white">
                            <h3 className="text-lg font-semibold">Freeze Student Account</h3>
                            <p className="mt-1 text-sm text-white/70">
                                {freezeModalStudent.name} ({freezeModalStudent.email})
                            </p>
                            <label className="mt-3 block text-xs uppercase tracking-widest text-cyan-300">Reason</label>
                            <textarea
                                rows={4}
                                value={freezeReason}
                                onChange={(e) => setFreezeReason(e.target.value)}
                                placeholder="Enter freeze reason..."
                                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                            />
                            <div className="mt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFreezeModalStudent(null);
                                        setFreezeReason("");
                                    }}
                                    className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmFreezeWithReason}
                                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black"
                                >
                                    Confirm Freeze
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {profileStudent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/65"
                            onClick={closeStudentProfile}
                        />
                        <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-white/15 bg-gray-950 p-4 text-white">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">Student Profile</h3>
                                    <p className="mt-1 text-sm text-white/70">{profileStudent.name} ({profileStudent.email})</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeStudentProfile}
                                    className="rounded border border-white/20 px-3 py-1 text-sm text-white/80"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Name</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.name}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Email</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.email}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Joined</p>
                                    <p className="mt-1 text-sm text-white">{fmtDateTime(profileStudent.createdAt)}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Total Submissions</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.submissionCount ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Accepted</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.acceptedCount ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Acceptance Rate</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.acceptanceRate ?? 0}%</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Latest Activity</p>
                                    <p className="mt-1 text-sm text-white">{fmtDateTime(profileStudent.latestSubmissionAt)}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Frozen</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.isFrozen ? "Yes" : "No"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Must Reset Password</p>
                                    <p className="mt-1 text-sm text-white">{profileStudent.mustResetPassword ? "Yes" : "No"}</p>
                                </div>
                            </div>

                            <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-3">
                                <h4 className="text-sm font-semibold text-white">Submission History</h4>
                                {profileLoading ? (
                                    <p className="mt-2 text-sm text-white/70">Loading submissions...</p>
                                ) : profileError ? (
                                    <p className="mt-2 text-sm text-red-200">{profileError}</p>
                                ) : profileSubmissions.length === 0 ? (
                                    <p className="mt-2 text-sm text-white/70">No submissions found.</p>
                                ) : (
                                    <div className="mt-2 overflow-x-auto">
                                        <table className="w-full min-w-[700px] text-left text-sm">
                                            <thead className="text-white/60">
                                                <tr>
                                                    <th className="py-2 pr-3">Date</th>
                                                    <th className="py-2 pr-3">Language</th>
                                                    <th className="py-2 pr-3">Status</th>
                                                    <th className="py-2 pr-3">Execution</th>
                                                    <th className="py-2 pr-3">Memory</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {profileSubmissions.map((sub) => (
                                                    <tr key={String(sub._id || `${sub.problemId}-${sub.createdAt}`)} className="border-t border-white/10">
                                                        <td className="py-2 pr-3 text-white/70">{fmtDateTime(sub.createdAt)}</td>
                                                        <td className="py-2 pr-3 text-white/80">{sub.language || "-"}</td>
                                                        <td className="py-2 pr-3 text-white">{sub.status || "-"}</td>
                                                        <td className="py-2 pr-3 text-white/80">{fmtMs(sub.executionTime)}</td>
                                                        <td className="py-2 pr-3 text-white/80">{sub.memory ?? "-"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {selectedSubmission && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/65"
                            onClick={() => setSelectedSubmission(null)}
                        />
                        <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-white/15 bg-gray-950 p-4 text-white">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">Submission Details</h3>
                                    <p className="mt-1 text-sm text-white/70">
                                        {selectedSubmission.user?.name || "Unknown"} ({selectedSubmission.user?.email || ""})
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedSubmission(null)}
                                    className="rounded border border-white/20 px-3 py-1 text-sm text-white/80"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">When</p>
                                    <p className="mt-1 text-sm text-white">{fmtDateTime(selectedSubmission.createdAt)}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Problem</p>
                                    <p className="mt-1 text-sm text-white">{selectedSubmission.problem?.title || "Unknown"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Language</p>
                                    <p className="mt-1 text-sm text-white">{selectedSubmission.language || "-"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Status</p>
                                    <p className="mt-1 text-sm text-white">{selectedSubmission.status || "-"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Execution</p>
                                    <p className="mt-1 text-sm text-white">{fmtMs(selectedSubmission.executionTime)}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Memory</p>
                                    <p className="mt-1 text-sm text-white">{selectedSubmission.memory ?? "-"}</p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Source Code</p>
                                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-white/90">{selectedSubmission.sourceCode || "-"}</pre>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                        <p className="text-xs uppercase tracking-widest text-cyan-300">Input</p>
                                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-white/90">{selectedSubmission.input || "-"}</pre>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                        <p className="text-xs uppercase tracking-widest text-cyan-300">Output</p>
                                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-white/90">{selectedSubmission.output || "-"}</pre>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <p className="text-xs uppercase tracking-widest text-cyan-300">Expected Output</p>
                                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-white/90">{selectedSubmission.expectedOutput || "-"}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* BULK IMPORT MODAL */}
                {showBulkImportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                        <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/15 bg-gray-950 p-6 text-white">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Bulk Import Problems</h3>
                                <button
                                    onClick={handleBulkImportCancel}
                                    className="text-2xl text-white/60 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            {!bulkImportResults ? (
                                <>
                                    <div className="mb-4 rounded-lg border border-white/10 bg-black/30 p-4">
                                        <p className="text-sm text-white/80 mb-3">
                                            Import problems from CSV or JSON file. Max {bulkImportFile ? Math.min(5, bulkImportPreview.length) : 0} problems shown in preview.
                                        </p>
                                        <label className="block">
                                            <span className="text-xs uppercase tracking-widest text-cyan-300">Select File</span>
                                            <input
                                                type="file"
                                                accept=".csv,.json"
                                                onChange={handleBulkImportFile}
                                                className="mt-2 block w-full text-xs text-white/70"
                                            />
                                        </label>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block">
                                            <span className="text-xs uppercase tracking-widest text-cyan-300">Default Event</span>
                                            <select
                                                value={bulkImportEventId}
                                                onChange={(e) => setBulkImportEventId(e.target.value)}
                                                className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                            >
                                                <option value="" style={{ color: "#000" }}>Use eventId from file rows</option>
                                                {problemEvents.map((evt) => (
                                                    <option key={evt.id} value={evt.id} style={{ color: "#000" }}>
                                                        {evt.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block">
                                            <span className="text-xs uppercase tracking-widest text-cyan-300">Conflict Mode</span>
                                            <select
                                                value={bulkImportConflictMode}
                                                onChange={(e) => setBulkImportConflictMode(e.target.value)}
                                                className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                                            >
                                                <option value="skip" style={{ color: "#000" }}>Skip duplicates</option>
                                                <option value="replace" style={{ color: "#000" }}>Replace duplicates</option>
                                                <option value="error" style={{ color: "#000" }}>Error on duplicates</option>
                                            </select>
                                        </label>
                                    </div>

                                    {problemBankError && (
                                        <div className="mb-4 rounded-lg border border-red-400/20 bg-red-950/30 p-3">
                                            <p className="text-xs text-red-200">{problemBankError}</p>
                                        </div>
                                    )}

                                    {bulkImportPreview.length > 0 && (
                                        <div className="mb-4 rounded-lg border border-white/10 bg-black/30 p-3">
                                            <p className="text-xs uppercase tracking-widest text-cyan-300 mb-2">Preview ({bulkImportPreview.length} of {bulkImportPreview.length})</p>
                                            <div className="max-h-40 overflow-auto space-y-2 text-xs">
                                                {bulkImportPreview.map((p, i) => (
                                                    <div key={i} className="rounded border border-white/10 bg-black/40 p-2">
                                                        <p><strong>{p.title}</strong> ({p.difficulty}) - {p.totalPoints}pts</p>
                                                        {p.testCases?.length > 0 && (
                                                            <p className="text-white/70">Test cases: {p.testCases.length}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleBulkImportCancel}
                                            className="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleBulkImportConfirm}
                                            disabled={bulkImportLoading || bulkImportPreview.length === 0}
                                            className="flex-1 rounded-lg border border-cyan-400/40 bg-cyan-950/30 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-50"
                                        >
                                            {bulkImportLoading ? "Importing..." : "Import"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="mb-4 space-y-2">
                                        <div className="rounded-lg border border-green-400/20 bg-green-950/30 p-3">
                                            <p className="text-sm text-green-200">✓ Imported: {bulkImportResults.imported.length}</p>
                                        </div>
                                        {bulkImportResults.skipped.length > 0 && (
                                            <div className="rounded-lg border border-yellow-400/20 bg-yellow-950/30 p-3">
                                                <p className="text-sm text-yellow-200">⊘ Skipped: {bulkImportResults.skipped.length}</p>
                                            </div>
                                        )}
                                        {bulkImportResults.failed.length > 0 && (
                                            <div className="rounded-lg border border-red-400/20 bg-red-950/30 p-3">
                                                <p className="text-sm text-red-200">✕ Failed: {bulkImportResults.failed.length}</p>
                                            </div>
                                        )}
                                    </div>

                                    {bulkImportResults.failed.length > 0 && (
                                        <div className="mb-4 max-h-32 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3">
                                            <p className="text-xs uppercase tracking-widest text-red-300 mb-2">Failed Items</p>
                                            {bulkImportResults.failed.map((item, i) => (
                                                <div key={i} className="text-xs text-red-200 mb-1">
                                                    <strong>{item.title}:</strong> {item.errors.join(", ")}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleBulkImportCancel}
                                        className="w-full rounded-lg border border-cyan-400/40 bg-cyan-950/30 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-950/50"
                                    >
                                        Close
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
