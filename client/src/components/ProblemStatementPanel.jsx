import React from "react";
import {
    archiveProblem,
    createProblem,
    fetchEvents,
    fetchProblemById,
    fetchProblems,
    getMyProblemSelection,
    lockMyProblemSelection,
    unlockMyProblemSelection,
    updateProblem,
} from "../services/api";
import { useCompilerStore } from "../store/useCompilerStore";

const STORAGE_KEY = "compiler-problem-statement";
const PROBLEM_ID_STORAGE_KEY = "compiler-problem-id";
const EVENT_ID_STORAGE_KEY = "compiler-event-id";

const DEFAULT_STATEMENT = `Smart India Hackathon 2025: Develop a unified citizen service portal that aggregates schemes, eligibility checks, and application tracking across central and state departments. The solution should
- provide multilingual support for at least three Indian languages,
- leverage AI to recommend relevant schemes based on user profiles,
- ensure accessibility for low-bandwidth regions, and
- offer secure integrations for departmental data exchange via open APIs.`;

const EMPTY_FORM = {
    title: "",
    statement: DEFAULT_STATEMENT,
    sampleInput: "",
    sampleOutput: "",
    expectedOutput: "Expected output format for hidden tests",
    eventId: "",
    difficulty: "medium",
    totalPoints: 100,
    passingThreshold: 100,
    tagsText: "",
    isActive: true,
};

function normalizeTags(tagsText) {
    return String(tagsText || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}

function resolveEventIdFromClient() {
    try {
        const url = new URL(window.location.href);
        const fromQuery = String(url.searchParams.get("eventId") || "").trim();
        if (/^[a-fA-F0-9]{24}$/.test(fromQuery)) {
            window.localStorage.setItem(EVENT_ID_STORAGE_KEY, fromQuery);
            return fromQuery;
        }

        const fromStorage = String(
            window.localStorage.getItem(EVENT_ID_STORAGE_KEY) || "",
        ).trim();
        if (/^[a-fA-F0-9]{24}$/.test(fromStorage)) {
            return fromStorage;
        }
    } catch {
        // ignore parsing/storage issues
    }

    return "";
}

export default function ProblemStatementPanel() {
    const currentUser = useCompilerStore((s) => s.currentUser);
    const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";

    const [problemStatement, setProblemStatement] = React.useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved || DEFAULT_STATEMENT;
        } catch {
            return DEFAULT_STATEMENT;
        }
    });
    const [problems, setProblems] = React.useState([]);
    const [selectedProblemId, setSelectedProblemId] = React.useState(() => {
        try {
            return String(localStorage.getItem(PROBLEM_ID_STORAGE_KEY) || "").trim();
        } catch {
            return "";
        }
    });
    const [isLoadingProblems, setIsLoadingProblems] = React.useState(false);
    const [problemError, setProblemError] = React.useState("");
    const [problemSuccess, setProblemSuccess] = React.useState("");
    const [isSaving, setIsSaving] = React.useState(false);
    const [activeProblemMeta, setActiveProblemMeta] = React.useState(null);
    const [adminForm, setAdminForm] = React.useState(EMPTY_FORM);
    const [problemEvents, setProblemEvents] = React.useState([]);
    const [activeEventId, setActiveEventId] = React.useState(() =>
        resolveEventIdFromClient(),
    );
    const [lockedSelection, setLockedSelection] = React.useState(null);
    const [selectionLoading, setSelectionLoading] = React.useState(false);
    const [isProblemPickerOpen, setIsProblemPickerOpen] = React.useState(false);

    const lockedProblemId = String(lockedSelection?.problemId || "");
    const isStudentEventMode = !isAdmin && Boolean(activeEventId);

    const broadcastStatement = React.useCallback((value) => {
        try {
            localStorage.setItem(STORAGE_KEY, value);
            window.dispatchEvent(
                new CustomEvent("problem-statement-updated", {
                    detail: { value },
                }),
            );
        } catch {
            // ignore persistence errors
        }
    }, []);

    React.useEffect(() => {
        broadcastStatement(problemStatement);
    }, [problemStatement, broadcastStatement]);

    React.useEffect(() => {
        if (!isAdmin) return;

        let active = true;
        (async () => {
            try {
                const response = await fetchEvents();
                if (!active) return;
                setProblemEvents(Array.isArray(response?.events) ? response.events : []);
            } catch {
                if (active) {
                    setProblemEvents([]);
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [isAdmin]);

    React.useEffect(() => {
        const syncEventId = () => {
            setActiveEventId(resolveEventIdFromClient());
        };

        syncEventId();
        window.addEventListener("popstate", syncEventId);
        return () => window.removeEventListener("popstate", syncEventId);
    }, []);

    const applyProblemToUI = React.useCallback((problem, problemId) => {
        const statementText = String(problem?.statement || "").trim();
        const nextStatement = statementText || DEFAULT_STATEMENT;

        setProblemStatement(nextStatement);
        setActiveProblemMeta({
            title: String(problem?.title || "Problem"),
            sampleInput: String(problem?.sampleInput || ""),
            sampleOutput: String(problem?.sampleOutput || ""),
            difficulty: String(problem?.difficulty || "medium"),
            totalPoints: Number(problem?.totalPoints || 100),
            testCaseCount: Number(problem?.testCaseCount || 0),
            expectedOutput: String(problem?.expectedOutput || ""),
            isActive: Boolean(problem?.isActive ?? true),
        });

        setAdminForm({
            title: String(problem?.title || ""),
            statement: nextStatement,
            sampleInput: String(problem?.sampleInput || ""),
            sampleOutput: String(problem?.sampleOutput || ""),
            expectedOutput: String(problem?.expectedOutput || "Expected output format for hidden tests"),
            eventId: String(problem?.event?.id || problem?.eventId || ""),
            difficulty: String(problem?.difficulty || "medium"),
            totalPoints: Number(problem?.totalPoints || 100),
            passingThreshold: Number(problem?.passingThreshold ?? 100),
            tagsText: Array.isArray(problem?.tags) ? problem.tags.join(", ") : "",
            isActive: Boolean(problem?.isActive ?? true),
        });

        if (problemId) {
            try {
                localStorage.setItem(PROBLEM_ID_STORAGE_KEY, String(problemId));
            } catch {
                // ignore storage issues
            }
        }
    }, []);

    const loadProblemDetail = React.useCallback(
        async (problemId) => {
            if (!problemId) return;
            try {
                setProblemError("");
                const response = await fetchProblemById(problemId);
                const problem = response?.problem;
                if (!problem) return;
                applyProblemToUI(problem, problemId);
            } catch (err) {
                setProblemError(
                    err?.response?.data?.error ||
                    err?.message ||
                    "Unable to load selected problem",
                );
            }
        },
        [applyProblemToUI],
    );

    const loadProblems = React.useCallback(async () => {
        try {
            setIsLoadingProblems(true);
            setProblemError("");
            const response = await fetchProblems(isAdmin);
            const items = Array.isArray(response?.problems) ? response.problems : [];
            setProblems(items);

            if (!items.length) {
                setActiveProblemMeta(null);
                if (isAdmin) {
                    setProblemStatement(DEFAULT_STATEMENT);
                    setAdminForm(EMPTY_FORM);
                }
                return;
            }

            const validSelected = items.some(
                (item) => String(item.id) === String(selectedProblemId),
            );
            const lockedExists = lockedProblemId
                ? items.some((item) => String(item.id) === lockedProblemId)
                : false;

            const nextProblemId = lockedExists
                ? lockedProblemId
                : validSelected
                    ? selectedProblemId
                    : String(items[0].id || "");

            if (nextProblemId) {
                setSelectedProblemId(nextProblemId);
                await loadProblemDetail(nextProblemId);
            }
        } catch (err) {
            setProblems([]);
            setActiveProblemMeta(null);
            setProblemError(
                err?.response?.data?.error || "Problem list unavailable in guest mode",
            );
        } finally {
            setIsLoadingProblems(false);
        }
    }, [isAdmin, loadProblemDetail, lockedProblemId, selectedProblemId]);

    React.useEffect(() => {
        loadProblems();
    }, [loadProblems]);

    const refreshMySelection = React.useCallback(async () => {
        if (!isStudentEventMode) {
            setLockedSelection(null);
            return;
        }

        setSelectionLoading(true);
        try {
            const response = await getMyProblemSelection(activeEventId);
            const selection = response?.selection || null;
            setLockedSelection(selection);

            const nextProblemId = String(selection?.problemId || "");
            if (nextProblemId && nextProblemId !== selectedProblemId) {
                setSelectedProblemId(nextProblemId);
                await loadProblemDetail(nextProblemId);
            }
        } catch (err) {
            if (err?.response?.status === 404) {
                setLockedSelection(null);
                return;
            }
            setProblemError(
                err?.response?.data?.error ||
                err?.message ||
                "Unable to load problem lock status",
            );
        } finally {
            setSelectionLoading(false);
        }
    }, [activeEventId, isStudentEventMode, loadProblemDetail, selectedProblemId]);

    React.useEffect(() => {
        refreshMySelection();
    }, [refreshMySelection]);

    const handleProblemChange = async (event) => {
        const nextId = String(event.target.value || "").trim();

        if (isStudentEventMode && lockedProblemId && nextId !== lockedProblemId) {
            setProblemError("You are locked to one problem for this event.");
            return;
        }

        setSelectedProblemId(nextId);
        await loadProblemDetail(nextId);
    };

    const handlePickProblem = async (problemId) => {
        const nextId = String(problemId || "").trim();
        if (!nextId) return;

        if (isStudentEventMode && lockedProblemId && nextId !== lockedProblemId) {
            setProblemError("You are locked to one problem for this event.");
            return;
        }

        setProblemError("");
        setSelectedProblemId(nextId);
        await loadProblemDetail(nextId);
        setIsProblemPickerOpen(false);
    };

    const handleLockCurrentProblem = async () => {
        if (!isStudentEventMode || !selectedProblemId) {
            return;
        }
        setSelectionLoading(true);
        setProblemError("");
        setProblemSuccess("");
        try {
            const response = await lockMyProblemSelection(activeEventId, selectedProblemId);
            setLockedSelection(response?.selection || null);
            setProblemSuccess("Problem locked for this event.");
        } catch (err) {
            setProblemError(
                err?.response?.data?.error ||
                err?.message ||
                "Unable to lock problem",
            );
        } finally {
            setSelectionLoading(false);
        }
    };

    const handleUnlockCurrentProblem = async () => {
        if (!isStudentEventMode) {
            return;
        }
        setSelectionLoading(true);
        setProblemError("");
        setProblemSuccess("");
        try {
            await unlockMyProblemSelection(activeEventId);
            setLockedSelection(null);
            setProblemSuccess("Problem unlocked. You can lock another problem now.");
        } catch (err) {
            setProblemError(
                err?.response?.data?.error ||
                err?.message ||
                "Unable to unlock problem",
            );
        } finally {
            setSelectionLoading(false);
        }
    };

    const onAdminFieldChange = (event) => {
        const { name, value, type, checked } = event.target;
        const nextValue = type === "checkbox" ? checked : value;
        setAdminForm((prev) => ({ ...prev, [name]: nextValue }));
        if (name === "statement") {
            setProblemStatement(String(nextValue || ""));
        }
    };

    const resetAdminDraft = () => {
        setSelectedProblemId("");
        setProblemError("");
        setProblemSuccess("Creating new problem draft.");
        setActiveProblemMeta(null);
        setAdminForm(EMPTY_FORM);
        setProblemStatement(DEFAULT_STATEMENT);
        try {
            localStorage.removeItem(PROBLEM_ID_STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    const handleAdminSave = async () => {
        if (!isAdmin) return;
        const title = String(adminForm.title || "").trim();
        const eventId = String(adminForm.eventId || "").trim();
        if (!title) {
            setProblemError("Title is required.");
            return;
        }
        if (!eventId) {
            setProblemError("Please select an event.");
            return;
        }

        setIsSaving(true);
        setProblemError("");
        setProblemSuccess("");

        try {
            const payload = {
                title,
                statement: String(adminForm.statement || "").trim() || DEFAULT_STATEMENT,
                sampleInput: String(adminForm.sampleInput || ""),
                sampleOutput: String(adminForm.sampleOutput || ""),
                expectedOutput:
                    String(adminForm.expectedOutput || "").trim() ||
                    "Expected output format for hidden tests",
                eventId,
                difficulty: String(adminForm.difficulty || "medium").toLowerCase(),
                totalPoints: Number(adminForm.totalPoints || 100),
                passingThreshold: Number(adminForm.passingThreshold ?? 100),
                tags: normalizeTags(adminForm.tagsText),
                isActive: Boolean(adminForm.isActive),
                testCases: [
                    {
                        name: "Sample Case",
                        input: String(adminForm.sampleInput || ""),
                        expectedOutput:
                            String(adminForm.sampleOutput || "").trim() ||
                            String(adminForm.expectedOutput || "").trim() ||
                            "Output",
                        isHidden: false,
                        order: 0,
                        weight: 1,
                    },
                ],
            };

            let response;
            if (selectedProblemId) {
                response = await updateProblem(selectedProblemId, payload);
                setProblemSuccess("Problem statement updated successfully.");
            } else {
                response = await createProblem(payload);
                setProblemSuccess("Problem statement created successfully.");
            }

            const nextProblem = response?.problem;
            if (nextProblem?.id) {
                setSelectedProblemId(String(nextProblem.id));
                applyProblemToUI(nextProblem, nextProblem.id);
            }

            await loadProblems();
        } catch (err) {
            setProblemError(
                err?.response?.data?.error || err?.message || "Unable to save problem",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleArchiveCurrent = async () => {
        if (!isAdmin || !selectedProblemId) return;

        setIsSaving(true);
        setProblemError("");
        setProblemSuccess("");
        try {
            await archiveProblem(selectedProblemId);
            setProblemSuccess("Problem archived successfully.");
            resetAdminDraft();
            await loadProblems();
        } catch (err) {
            setProblemError(
                err?.response?.data?.error ||
                err?.message ||
                "Unable to archive problem",
            );
        } finally {
            setIsSaving(false);
        }
    };

    React.useEffect(() => {
        try {
            if (selectedProblemId) {
                localStorage.setItem(PROBLEM_ID_STORAGE_KEY, String(selectedProblemId));
            }
        } catch {
            // ignore persistence errors
        }
    }, [selectedProblemId]);

    React.useEffect(() => {
        const onSync = (event) => {
            const value = event?.detail?.value;
            if (typeof value === "string") {
                setProblemStatement(value);
                if (isAdmin) {
                    setAdminForm((prev) => ({ ...prev, statement: value }));
                }
            }
        };

        window.addEventListener("problem-statement-updated", onSync);
        return () => window.removeEventListener("problem-statement-updated", onSync);
    }, [isAdmin]);

    const hasServerProblem = Boolean(activeProblemMeta && selectedProblemId);
    const nonAdminReadOnly = hasServerProblem && !isAdmin;

    return (
        <div className="ui-surface flex h-full min-h-0 flex-col bg-gray-900/60 shadow-lg">
            <div className="ui-header">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
                        Problem Statement
                    </h2>
                    <button
                        type="button"
                        onClick={() => setIsProblemPickerOpen(true)}
                        disabled={isLoadingProblems || !problems.length}
                        className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        View
                    </button>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isAdmin ? (
                        <select
                            value={selectedProblemId}
                            onChange={handleProblemChange}
                            disabled={
                                isLoadingProblems ||
                                !problems.length ||
                                (isStudentEventMode && Boolean(lockedProblemId))
                            }
                            className="w-full rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60 sm:max-w-xs"
                        >
                            {!problems.length ? (
                                <option value="">No server problem selected</option>
                            ) : (
                                problems.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title}
                                    </option>
                                ))
                            )}
                        </select>
                    ) : (
                        <div className="w-full rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 sm:max-w-xs">
                            {activeProblemMeta?.title || "No problem selected"}
                        </div>
                    )}
                    {activeProblemMeta && (
                        <div className="text-[11px] text-cyan-100/70">
                            {activeProblemMeta.difficulty.toUpperCase()} • {activeProblemMeta.totalPoints} pts • {activeProblemMeta.testCaseCount} tests
                        </div>
                    )}
                </div>

                {isStudentEventMode && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100/85">
                            Event lock mode enabled
                        </span>
                        {lockedProblemId ? (
                            <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100/90">
                                Locked problem: {lockedProblemId.slice(-6)}
                            </span>
                        ) : (
                            <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100/90">
                                No locked problem yet
                            </span>
                        )}
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                            name="title"
                            value={adminForm.title}
                            onChange={onAdminFieldChange}
                            placeholder="Problem title"
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <select
                            name="difficulty"
                            value={adminForm.difficulty}
                            onChange={onAdminFieldChange}
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        >
                            <option value="easy">easy</option>
                            <option value="medium">medium</option>
                            <option value="hard">hard</option>
                        </select>
                        <select
                            name="eventId"
                            value={adminForm.eventId}
                            onChange={onAdminFieldChange}
                            className="sm:col-span-2 rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        >
                            <option value="">Select event</option>
                            {problemEvents.map((evt) => (
                                <option key={evt.id} value={evt.id}>{evt.title}</option>
                            ))}
                        </select>
                        <input
                            name="sampleInput"
                            value={adminForm.sampleInput}
                            onChange={onAdminFieldChange}
                            placeholder="Sample input"
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <input
                            name="sampleOutput"
                            value={adminForm.sampleOutput}
                            onChange={onAdminFieldChange}
                            placeholder="Sample output"
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <input
                            name="totalPoints"
                            type="number"
                            min="1"
                            value={adminForm.totalPoints}
                            onChange={onAdminFieldChange}
                            placeholder="Total points"
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <input
                            name="passingThreshold"
                            type="number"
                            min="0"
                            max="100"
                            value={adminForm.passingThreshold}
                            onChange={onAdminFieldChange}
                            placeholder="Passing threshold (%)"
                            className="rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <input
                            name="tagsText"
                            value={adminForm.tagsText}
                            onChange={onAdminFieldChange}
                            placeholder="Tags (comma separated)"
                            className="sm:col-span-2 rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <input
                            name="expectedOutput"
                            value={adminForm.expectedOutput}
                            onChange={onAdminFieldChange}
                            placeholder="Expected output format"
                            className="sm:col-span-2 rounded-lg border border-cyan-400/20 bg-gray-900/80 px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/60"
                        />
                        <label className="sm:col-span-2 flex items-center gap-2 text-[11px] text-cyan-100/80">
                            <input
                                type="checkbox"
                                name="isActive"
                                checked={adminForm.isActive}
                                onChange={onAdminFieldChange}
                            />
                            Active problem
                        </label>
                    </div>
                )}

                {(problemError || problemSuccess) && (
                    <div className="mt-2 space-y-2">
                        {problemError && (
                            <p className="text-[11px] text-amber-200/90">{problemError}</p>
                        )}
                        {problemSuccess && (
                            <p className="text-[11px] text-emerald-200/90">{problemSuccess}</p>
                        )}
                    </div>
                )}
            </div>

            {isProblemPickerOpen && (
                <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-3 sm:p-5">
                    <div className="w-full max-w-xl rounded-xl border border-cyan-500/20 bg-gray-900/95 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
                            <h3 className="text-sm font-semibold text-cyan-100">
                                Select Problem Statement
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsProblemPickerOpen(false)}
                                className="rounded-md border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
                            >
                                Close
                            </button>
                        </div>

                        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
                            {!problems.length ? (
                                <div className="rounded-lg border border-cyan-500/20 bg-gray-800/60 p-3 text-xs text-cyan-100/70">
                                    No problems available right now.
                                </div>
                            ) : (
                                problems.map((item) => {
                                    const isSelected = String(item.id) === String(selectedProblemId);
                                    const blockedByLock =
                                        isStudentEventMode &&
                                        Boolean(lockedProblemId) &&
                                        String(item.id) !== String(lockedProblemId);

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handlePickProblem(item.id)}
                                            disabled={blockedByLock}
                                            className={`w-full rounded-lg border p-3 text-left transition ${isSelected
                                                ? "border-cyan-300/70 bg-cyan-500/15"
                                                : "border-cyan-500/20 bg-gray-800/70 hover:bg-gray-800"
                                                } ${blockedByLock ? "cursor-not-allowed opacity-50" : ""}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-cyan-100">
                                                    {item.title}
                                                </p>
                                                <span className="text-[10px] uppercase tracking-wide text-cyan-200/70">
                                                    {String(item.difficulty || "medium")}
                                                </span>
                                            </div>
                                            <p className="mt-1 line-clamp-2 text-xs text-cyan-100/75">
                                                {String(item.statement || "No statement available")}
                                            </p>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 p-2.5 sm:p-3.5">
                <textarea
                    value={isAdmin ? adminForm.statement : problemStatement}
                    onChange={(e) => {
                        const value = e.target.value;
                        if (isAdmin) {
                            setAdminForm((prev) => ({ ...prev, statement: value }));
                        }
                        setProblemStatement(value);
                    }}
                    placeholder="Document the challenge, constraints, and expected behavior here..."
                    readOnly={nonAdminReadOnly}
                    className="h-full min-h-[180px] w-full resize-none rounded-lg border border-cyan-500/20 bg-gray-800/80 p-3 font-mono text-sm leading-6 text-cyan-100 placeholder:text-cyan-100/40 outline-none transition-all duration-200 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
                />

                {hasServerProblem && (
                    <div className="mt-2 rounded-lg border border-cyan-500/20 bg-gray-800/70 p-2 text-[11px] text-cyan-100/80">
                        <div>Sample Input: {activeProblemMeta?.sampleInput || "(none)"}</div>
                        <div>Sample Output: {activeProblemMeta?.sampleOutput || "(none)"}</div>
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={isSaving || !adminForm.eventId}
                            onClick={handleAdminSave}
                            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-70"
                        >
                            {isSaving
                                ? "Saving..."
                                : selectedProblemId
                                    ? "Update Problem"
                                    : "Create Problem"}
                        </button>
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={resetAdminDraft}
                            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/80"
                        >
                            New Draft
                        </button>
                        <button
                            type="button"
                            disabled={isSaving || !selectedProblemId}
                            onClick={handleArchiveCurrent}
                            className="rounded-lg border border-red-400/40 px-3 py-2 text-xs text-red-200 disabled:opacity-70"
                        >
                            Archive
                        </button>
                    </div>
                )}

                {isStudentEventMode && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={
                                selectionLoading || !selectedProblemId || Boolean(lockedProblemId)
                            }
                            onClick={handleLockCurrentProblem}
                            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-70"
                        >
                            {selectionLoading ? "Please wait..." : "Lock This Problem"}
                        </button>
                        <button
                            type="button"
                            disabled={selectionLoading || !lockedProblemId}
                            onClick={handleUnlockCurrentProblem}
                            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/85 disabled:opacity-70"
                        >
                            Unlock
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
