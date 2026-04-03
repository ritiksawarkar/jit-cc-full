import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useCompilerStore } from "../store/useCompilerStore";
import {
  executeCode,
  fetchMyCertificates,
  fetchMyEvents,
  fetchUserSubmissions,
  getSettings,
  loginWithEmail,
  joinEventWithCode,
  requestPasswordReset,
  setProjectRoot,
  signupWithEmail,
  submitCode,
} from "../services/api";
import { useToast } from "./ToastProvider";
import { motion } from "framer-motion";
import {
  Play,
  RotateCcw,
  MoreVertical,
  UserCircle2,
  Settings,
  History,
  CalendarPlus,
  CalendarDays,
  BadgeCheck,
  Shield,
  Trophy,
  Download,
  LogOut,
} from "lucide-react";
import NotificationBadge from "./NotificationBadge";
import { resolveDependencies } from "../services/api";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getDefaultFileNameForLanguage } from "../lib/languageUtils";
import { THEMES } from "../lib/languageMap";
import Leaderboard from './Leaderboard';
import { submitScore } from '../services/api';

const EVENT_ID_STORAGE_KEY = "compiler-event-id";
const EVENT_TIMER_SESSION_STORAGE_KEY = "compiler-event-timer-session";

function resolveEventIdForSubmission() {
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
    // ignore URL/storage access errors
  }

  return "";
}

function loadEventTimerSession() {
  try {
    const raw = window.localStorage.getItem(EVENT_TIMER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveEventTimerSession(session) {
  try {
    if (!session) {
      window.localStorage.removeItem(EVENT_TIMER_SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      EVENT_TIMER_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // ignore storage errors
  }
}

function getRemainingSecondsFromSession(session, nowMs = Date.now()) {
  const expiresAtMs = new Date(session?.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return 0;
  return Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
}

function fmtDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function toReadableError(e) {
  const payload = e?.response?.data ?? e;
  const upstream = payload?.upstream;

  let lines = [];
  if (payload?.error) lines.push(String(payload.error));
  if (payload?.message) lines.push(String(payload.message));
  if (upstream) {
    try {
      lines.push(JSON.stringify(upstream, null, 2));
    } catch {
      lines.push(String(upstream));
    }
  } else if (typeof payload === "string") {
    lines.push(payload);
  } else if (e?.message) {
    lines.push(String(e.message));
  } else {
    try {
      lines.push(JSON.stringify(payload, null, 2));
    } catch {
      lines.push(String(payload));
    }
  }
  return lines.filter(Boolean).join("\n");
}

export default function RunButtons() {
  const navigate = useNavigate();
  const {
    languageId,
    source,
    stdin,
    isRunning,
    setIsRunning,
    setResult,
    clearIO,
    theme,
    setTheme,
    editorFontSize,
    setEditorFontSize,
    showMinimap,
    setShowMinimap,
    wordWrap,
    setWordWrap,
    showLineNumbers,
    setShowLineNumbers,
    tabSize,
    setTabSize,
    runLimit,
    setRunLimit,
    exportAllFiles,
    setExportAllFiles,
    autoSaveEnabled,
    autoSaveInterval,
    setAutoSaveEnabled,
    setAutoSaveInterval,
    currentUser,
    setAuthSession,
    logout,
  } = useCompilerStore();
  const { tabs, activeTabId } = useCompilerStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // 'signin' or 'signup'
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordNotice, setForgotPasswordNotice] = useState("");
  const [forgotPasswordResetUrl, setForgotPasswordResetUrl] = useState("");
  const [isRequestingForgotPassword, setIsRequestingForgotPassword] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isSubmissionHistoryOpen, setIsSubmissionHistoryOpen] = useState(false);
  const [submissionHistoryLoading, setSubmissionHistoryLoading] = useState(false);
  const [submissionHistoryItems, setSubmissionHistoryItems] = useState([]);
  const [isMyEventsOpen, setIsMyEventsOpen] = useState(false);
  const [myEventsLoading, setMyEventsLoading] = useState(false);
  const [myEventsItems, setMyEventsItems] = useState([]);
  const [isMyCertificationsOpen, setIsMyCertificationsOpen] = useState(false);
  const [myCertificationsLoading, setMyCertificationsLoading] = useState(false);
  const [myCertificationsItems, setMyCertificationsItems] = useState([]);
  const [menuQuickCounts, setMenuQuickCounts] = useState({
    joinedEvents: 0,
    certificates: 0,
    loading: false,
    hasLoaded: false,
  });
  const [isJoinEventOpen, setIsJoinEventOpen] = useState(false);
  const [joinEventCode, setJoinEventCode] = useState("");
  const [joinEventError, setJoinEventError] = useState("");
  const [isJoiningEvent, setIsJoiningEvent] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [eventSessionState, setEventSessionState] = useState({
    active: false,
    expired: false,
    remainingSeconds: 0,
  });
  const menuRef = useRef(null);
  const settingsRef = useRef(null);
  const loginRef = useRef(null);
  const joinEventRef = useRef(null);
  const myEventsRef = useRef(null);
  const myCertificationsRef = useRef(null);

  const buildExecutionPayload = () => {
    const latestState = useCompilerStore.getState();
    const latestTabs = latestState.tabs || [];
    const latestActiveTabId = latestState.activeTabId;
    const active = latestTabs.find((t) => t.id === latestActiveTabId) || null;

    let stdinValue = String(latestState.stdin ?? "").replace(/\r\n/g, "\n");
    if (stdinValue && !stdinValue.endsWith("\n")) {
      stdinValue += "\n";
    }

    return {
      language_id: latestState.languageId ?? languageId,
      source_code: active?.content ?? latestState.source ?? source,
      stdin: stdinValue,
    };
  };

  const onRun = async () => {
    try {
      const can = useCompilerStore.getState().canRun;
      if (can && !can()) {
        alert('Daily run limit reached. Change your Run Code Limit in Settings.');
        return;
      }
    } catch { }
    setIsRunning(true);
    setResult(null);
    try {
      const payload = buildExecutionPayload();
      const data = await executeCode(payload);
      setResult(data);
      try {
        // record run in daily counters
        const record = useCompilerStore.getState().recordRun;
        if (record) record();
      } catch (e) { }
      try {
        // increment runCount and poke leaderboard
        const inc = useCompilerStore.getState().incrementRunCount;
        if (inc) inc();
        const poke = useCompilerStore.getState().pokeLeaderboard;
        if (poke) poke();

        // submit score (runCount) in background if logged in
        const state = useCompilerStore.getState();
        if (state.currentUser) {
          // best-effort: send current runCount as score
          const rc = state.runCount || 0;
          try {
            await submitScore(rc);
            // refresh leaderboard
            if (poke) poke();
          } catch (err) {
            // ignore submission errors
          }
        }
      } catch (e) { }
    } catch (e) {
      setResult({
        status: { description: "Request Error" },
        stderr: toReadableError(e),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const onSubmitCode = async () => {
    if (!currentUser?.id) {
      toast.push({
        type: "error",
        title: "Login required",
        message: "Please sign in before submitting code.",
      });
      return;
    }

    let problemId = "";
    try {
      problemId = String(window.localStorage.getItem("compiler-problem-id") || "").trim();
    } catch {
      problemId = "";
    }

    // Problem ID is optional; backend will resolve a default problem if missing/invalid.
    const hasValidProblemId = /^[a-fA-F0-9]{24}$/.test(problemId);

    const payload = buildExecutionPayload();
    const eventId = resolveEventIdForSubmission();

    if (eventId) {
      const session = loadEventTimerSession();
      if (session?.eventId === eventId) {
        const remaining = getRemainingSecondsFromSession(session);
        if (remaining <= 0) {
          toast.push({
            type: "error",
            title: "Event time over",
            message: "Submission window for this event has expired.",
          });
          return;
        }
      }
    }

    try {
      setIsSubmittingCode(true);
      const response = await submitCode({
        problemId: hasValidProblemId ? problemId : undefined,
        eventId: eventId || undefined,
        language_id: payload.language_id,
        language: String(payload.language_id),
        sourceCode: payload.source_code,
        input: payload.stdin,
      });

      const execution = response?.execution || {};
      const evaluation = response?.evaluation || {};
      setResult({
        status: execution.status || {
          description: response?.submission?.status || "Submitted",
        },
        stdout: execution.stdout || response?.submission?.output || "",
        stderr: execution.stderr || "",
        compile_output: execution.compile_output || "",
        time: response?.submission?.executionTime
          ? String(Number(response.submission.executionTime) / 1000)
          : "",
        memory: response?.submission?.memory || null,
        evaluation,
      });

      toast.push({
        type: "success",
        title: "Submission saved",
        message: `Status: ${response?.submission?.status || "Saved"}${evaluation?.score ? ` • Score: ${evaluation.score.earned}/${evaluation.score.total}` : ""}`,
      });
    } catch (err) {
      toast.push({
        type: "error",
        title: "Submission failed",
        message: err?.response?.data?.error || err?.message || "Unable to submit code",
      });
    } finally {
      setIsSubmittingCode(false);
    }
  };

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen || !currentUser?.id) return;
    if (String(currentUser?.role || "").toLowerCase() !== "student") return;

    let cancelled = false;

    setMenuQuickCounts((prev) => ({ ...prev, loading: true }));

    (async () => {
      try {
        const [eventsRes, certsRes] = await Promise.all([
          fetchMyEvents(),
          fetchMyCertificates(),
        ]);

        if (cancelled) return;

        const eventsCount = Array.isArray(eventsRes?.events)
          ? eventsRes.events.length
          : 0;
        const certsCount = Array.isArray(certsRes?.certificates)
          ? certsRes.certificates.length
          : 0;

        setMenuQuickCounts({
          joinedEvents: eventsCount,
          certificates: certsCount,
          loading: false,
          hasLoaded: true,
        });
      } catch {
        if (cancelled) return;
        setMenuQuickCounts((prev) => ({
          ...prev,
          loading: false,
          hasLoaded: prev.hasLoaded,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMenuOpen, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleClickAway = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen]);

  // When settings modal opens, fetch server settings
  useEffect(() => {
    if (!isSettingsOpen) return;
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings();
        if (mounted) setServerSettings({ projectRoot: s.projectRoot || '' });
      } catch (e) {
        try { toast.push({ type: 'error', title: 'Settings load failed', message: e?.message || String(e) }); } catch { }
      }
    })();
    return () => { mounted = false; };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isLoginOpen) return;

    const handleClickAway = (event) => {
      if (loginRef.current && !loginRef.current.contains(event.target)) {
        setIsLoggingIn(false);
        setLoginForm({ name: "", email: "", password: "", role: "student" });
        setLoginError("");
        setIsForgotPasswordMode(false);
        setForgotPasswordEmail("");
        setForgotPasswordError("");
        setForgotPasswordNotice("");
        setForgotPasswordResetUrl("");
        setIsRequestingForgotPassword(false);
        setIsLoginOpen(false);
        setLoginNotice("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLoggingIn(false);
        setLoginForm({ name: "", email: "", password: "", role: "student" });
        setLoginError("");
        setLoginNotice("");
        setIsForgotPasswordMode(false);
        setForgotPasswordEmail("");
        setForgotPasswordError("");
        setForgotPasswordNotice("");
        setForgotPasswordResetUrl("");
        setIsRequestingForgotPassword(false);
        setIsLoginOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLoginOpen]);

  useEffect(() => {
    if (!isJoinEventOpen) return;

    const handleClickAway = (event) => {
      if (joinEventRef.current && !joinEventRef.current.contains(event.target)) {
        setIsJoinEventOpen(false);
        setJoinEventCode("");
        setJoinEventError("");
        setIsJoiningEvent(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsJoinEventOpen(false);
        setJoinEventCode("");
        setJoinEventError("");
        setIsJoiningEvent(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isJoinEventOpen]);

  useEffect(() => {
    if (!isLogoutConfirmOpen) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLogoutConfirmOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLogoutConfirmOpen]);

  useEffect(() => {
    if (!isMyEventsOpen) return;

    const handleClickAway = (event) => {
      if (myEventsRef.current && !myEventsRef.current.contains(event.target)) {
        setIsMyEventsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMyEventsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMyEventsOpen]);

  useEffect(() => {
    if (!isMyCertificationsOpen) return;

    const handleClickAway = (event) => {
      if (
        myCertificationsRef.current &&
        !myCertificationsRef.current.contains(event.target)
      ) {
        setIsMyCertificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMyCertificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMyCertificationsOpen]);

  useEffect(() => {
    const syncEventSession = () => {
      const activeEventId = resolveEventIdForSubmission();
      const session = loadEventTimerSession();

      if (!activeEventId || !session || String(session.eventId || "") !== String(activeEventId)) {
        setEventSessionState({
          active: false,
          expired: false,
          remainingSeconds: 0,
        });
        return;
      }

      const remainingSeconds = getRemainingSecondsFromSession(session);
      setEventSessionState({
        active: true,
        expired: remainingSeconds <= 0,
        remainingSeconds,
      });
    };

    syncEventSession();
    const intervalId = window.setInterval(syncEventSession, 1000);
    window.addEventListener("popstate", syncEventSession);
    window.addEventListener("storage", syncEventSession);
    window.addEventListener("compiler-event-session-updated", syncEventSession);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("popstate", syncEventSession);
      window.removeEventListener("storage", syncEventSession);
      window.removeEventListener("compiler-event-session-updated", syncEventSession);
    };
  }, []);

  const handleExportToZip = async () => {
    try {
      const zip = new JSZip();
      if (exportAllFiles) {
        // include every open tab
        (tabs || []).forEach((t) => {
          const langId = t.languageId ?? languageId;
          const name = t.name || getDefaultFileNameForLanguage(langId);
          zip.file(name, t.content ?? "");
        });
      } else {
        const active = (tabs || []).find((t) => t.id === activeTabId) || null;
        const exportLangId = active?.languageId ?? languageId;
        const defaultFileName = getDefaultFileNameForLanguage(exportLangId);
        zip.file(defaultFileName, (active?.content ?? source) ?? "");
      }

      if (stdin?.trim()) {
        zip.file("stdin.txt", stdin);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `esm-code-${Date.now()}.zip`);
    } catch (error) {
      console.error("Failed to export project archive", error);
    } finally {
      setIsMenuOpen(false);
      try {
        const poke = useCompilerStore.getState().pokeLeaderboard;
        if (poke) poke();
      } catch (e) { }
    }
  };

  const handleSettingsClick = () => {
    setIsMenuOpen(false);
    setIsLoginOpen(false);
    setIsSettingsOpen(true);
  };


  const [isLeaderboardOpen, setIsLeaderboardOpen] = React.useState(false);
  const [isDepsOpen, setIsDepsOpen] = React.useState(false);
  const [depsDetected, setDepsDetected] = React.useState(null);
  const [isInstallingDeps, setIsInstallingDeps] = React.useState(false);
  const [depsInstallResult, setDepsInstallResult] = React.useState(null);
  const toast = useToast();
  const [serverSettings, setServerSettings] = useState({ projectRoot: '' });
  const [newRoot, setNewRoot] = useState('');

  const buildDependencyScanSource = () => {
    const active = (tabs || []).find((t) => t.id === activeTabId) || null;
    const activeSource = String(active?.content ?? source ?? "").trim();
    const tabSources = (tabs || [])
      .map((t) => String(t?.content || "").trim())
      .filter(Boolean)
      .slice(0, 25);

    return [activeSource, ...tabSources].filter(Boolean).join("\n\n");
  };

  const openDependencyModalAndDetect = async () => {
    setIsDepsOpen(true);
    setDepsDetected(null);
    setDepsInstallResult(null);
    try {
      const data = await resolveDependencies({
        language: "auto",
        source: buildDependencyScanSource(),
        scanProject: true,
        dryRun: true,
        action: "detect",
      });
      const detected =
        data?.installResults?.detected || data?.detected || { node: [], python: [] };
      setDepsDetected(detected);
    } catch (err) {
      setDepsDetected({
        error: err?.response?.data?.error || err?.message || String(err),
      });
    }
  };

  const installDetectedDependencies = async () => {
    if (!depsDetected || depsDetected.error) return;
    const hasNode = Array.isArray(depsDetected.node) && depsDetected.node.length > 0;
    const hasPython = Array.isArray(depsDetected.python) && depsDetected.python.length > 0;
    if (!hasNode && !hasPython) {
      toast.push({
        type: "info",
        title: "No packages to install",
        message: "No external dependencies were detected.",
      });
      return;
    }

    setIsInstallingDeps(true);
    setDepsInstallResult(null);
    try {
      const res = await resolveDependencies({
        language: "auto",
        source: buildDependencyScanSource(),
        scanProject: true,
        dryRun: false,
        action: "install",
      });
      const installResults = res?.installResults || {};
      setDepsInstallResult(installResults);
      setDepsDetected(installResults?.detected || depsDetected);

      const nodeCode = installResults?.node?.code;
      const pyCode = installResults?.python?.code;
      const nodeOk = nodeCode === null || nodeCode === undefined || Number(nodeCode) === 0;
      const pyOk = pyCode === null || pyCode === undefined || Number(pyCode) === 0;
      const status = nodeOk && pyOk ? "success" : "error";

      toast.push({
        type: status,
        title: status === "success" ? "Install completed" : "Install completed with errors",
        message:
          status === "success"
            ? "Detected dependencies were installed successfully."
            : "Some dependency installs failed. Check install output in modal.",
      });
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || String(err);
      toast.push({ type: "error", title: "Install failed", message });
      setDepsInstallResult({ error: message });
    } finally {
      setIsInstallingDeps(false);
    }
  };

  const openLeaderboard = () => {
    setIsMenuOpen(false);
    setIsLeaderboardOpen(true);
  };

  const openSubmissionHistory = async () => {
    if (!currentUser?.id) {
      toast.push({
        type: "error",
        title: "Login required",
        message: "Please sign in to view submission history.",
      });
      return;
    }

    setIsMenuOpen(false);
    setIsSubmissionHistoryOpen(true);
    setSubmissionHistoryLoading(true);

    try {
      const response = await fetchUserSubmissions(currentUser.id);
      setSubmissionHistoryItems(response?.submissions || []);
    } catch (err) {
      setSubmissionHistoryItems([]);
      toast.push({
        type: "error",
        title: "History unavailable",
        message: err?.response?.data?.error || err?.message || "Unable to load submissions",
      });
    } finally {
      setSubmissionHistoryLoading(false);
    }
  };

  const activateEventById = (eventId) => {
    const normalizedEventId = String(eventId || "").trim();
    if (!/^[a-fA-F0-9]{24}$/.test(normalizedEventId)) {
      toast.push({
        type: "error",
        title: "Invalid event",
        message: "Unable to activate this event.",
      });
      return;
    }

    try {
      window.localStorage.setItem(EVENT_ID_STORAGE_KEY, normalizedEventId);
      const url = new URL(window.location.href);
      url.searchParams.set("eventId", normalizedEventId);
      window.history.replaceState({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.dispatchEvent(new Event("compiler-event-session-updated"));
    } catch {
      // ignore browser API limitations
    }
  };

  const openMyEvents = async () => {
    if (!currentUser?.id) {
      toast.push({
        type: "error",
        title: "Login required",
        message: "Please sign in to view your events.",
      });
      setIsMenuOpen(false);
      handleLoginClick();
      return;
    }

    setIsMenuOpen(false);
    setIsMyEventsOpen(true);
    setMyEventsLoading(true);
    try {
      const response = await fetchMyEvents();
      setMyEventsItems(response?.events || []);
    } catch (err) {
      setMyEventsItems([]);
      toast.push({
        type: "error",
        title: "My Events unavailable",
        message: err?.response?.data?.error || err?.message || "Unable to load events",
      });
    } finally {
      setMyEventsLoading(false);
    }
  };

  const openMyCertifications = async () => {
    if (!currentUser?.id) {
      toast.push({
        type: "error",
        title: "Login required",
        message: "Please sign in to view your certifications.",
      });
      setIsMenuOpen(false);
      handleLoginClick();
      return;
    }

    setIsMenuOpen(false);
    setIsMyCertificationsOpen(true);
    setMyCertificationsLoading(true);
    try {
      const response = await fetchMyCertificates();
      setMyCertificationsItems(response?.certificates || []);
    } catch (err) {
      setMyCertificationsItems([]);
      toast.push({
        type: "error",
        title: "My Certification unavailable",
        message: err?.response?.data?.error || err?.message || "Unable to load certificates",
      });
    } finally {
      setMyCertificationsLoading(false);
    }
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
  };

  const handleFontSizeChange = (event) => {
    const nextSize = Number(event.target.value);
    if (!Number.isNaN(nextSize)) {
      setEditorFontSize(nextSize);
    }
  };

  const handleWordWrapChange = (event) => {
    setWordWrap(event.target.value);
  };

  const toggleMinimap = () => {
    setShowMinimap(!showMinimap);
  };

  const toggleLineNumbers = () => {
    setShowLineNumbers(!showLineNumbers);
  };

  const handleTabSizeChange = (event) => {
    const nextSize = Number(event.target.value);
    if (Number.isNaN(nextSize)) {
      return;
    }
    const clamped = Math.min(8, Math.max(2, nextSize));
    setTabSize(clamped);
  };

  const handleLoginClick = () => {
    setIsMenuOpen(false);
    setIsSettingsOpen(false);
    setLoginError("");
    setLoginNotice("");
    setIsForgotPasswordMode(false);
    setForgotPasswordEmail("");
    setForgotPasswordError("");
    setForgotPasswordNotice("");
    setForgotPasswordResetUrl("");
    setIsRequestingForgotPassword(false);
    setAuthMode("signin");
    setLoginForm({
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      password: "",
      role: String(currentUser?.role || "student").toLowerCase(),
    });
    setIsLoginOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginOpen(false);
    setLoginError("");
    setLoginNotice("");
    setIsLoggingIn(false);
    setIsForgotPasswordMode(false);
    setForgotPasswordEmail("");
    setForgotPasswordError("");
    setForgotPasswordNotice("");
    setForgotPasswordResetUrl("");
    setIsRequestingForgotPassword(false);
    setAuthMode("signin");
    setLoginForm({ name: "", email: "", password: "", role: "student" });
  };

  const handleLoginFormChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = loginForm.email.trim().toLowerCase();
    const trimmedPassword = loginForm.password.trim();
    const selectedRole = ["student", "admin"].includes(String(loginForm.role).toLowerCase())
      ? String(loginForm.role).toLowerCase()
      : "student";

    if (!emailPattern.test(trimmedEmail)) {
      setLoginError("Enter a valid email address.");
      return;
    }

    if (!trimmedPassword) {
      setLoginError("Password is required.");
      return;
    }

    try {
      setIsLoggingIn(true);
      setLoginError("");
      setLoginNotice("");
      if (authMode === "signin") {
        const data = await loginWithEmail({ email: trimmedEmail, password: trimmedPassword });
        const role = String(data?.user?.role || "student").toLowerCase();
        if (selectedRole !== role) {
          setLoginError(`This account is registered as ${role}. Please select the ${role} role to continue.`);
          setIsLoggingIn(false);
          return;
        }

        setAuthSession({ user: data.user, token: data.token });
        closeLoginModal();

        if (role === "admin") {
          navigate("/admin/dashboard", { replace: true });
        } else {
          navigate("/compiler", { replace: true });
        }
      } else {
        // signup
        const trimmedName = loginForm.name.trim();
        if (!trimmedName) {
          setLoginError("Name is required for signup.");
          setIsLoggingIn(false);
          return;
        }
        await signupWithEmail({
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword,
          role: selectedRole,
        });
        // After successful signup, open the Sign In modal so the user can sign in manually
        try { toast.push({ type: 'success', title: 'Account created', message: 'Please sign in to continue.' }); } catch (e) { }
        setAuthMode('signin');
        setLoginForm({ name: '', email: trimmedEmail, password: '', role: selectedRole });
        setLoginNotice('Account created. Please sign in.');
        setIsLoginOpen(true);
        setIsLoggingIn(false);

        navigate("/compiler", { replace: true });
      }
    } catch (error) {
      const isResetRequired =
        String(error?.response?.data?.code || "") === "PASSWORD_RESET_REQUIRED";
      if (isResetRequired) {
        setIsForgotPasswordMode(true);
        setForgotPasswordEmail(trimmedEmail);
        setLoginNotice("Password reset is required for this account.");
      }
      const message = error?.response?.data?.error || error?.message || "Authentication failed";
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = String(forgotPasswordEmail || loginForm.email || "")
      .trim()
      .toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      setForgotPasswordError("Enter a valid email address.");
      return;
    }

    try {
      setIsRequestingForgotPassword(true);
      setForgotPasswordError("");
      setForgotPasswordNotice("");
      setForgotPasswordResetUrl("");

      const response = await requestPasswordReset(normalizedEmail);
      const emailed = Boolean(response?.delivery?.emailed);
      setForgotPasswordNotice(
        emailed
          ? "Password reset email sent. Please check your inbox."
          : response?.message || "If this account exists, a reset link has been generated.",
      );
      if (response?.reset?.resetUrl) {
        setForgotPasswordResetUrl(String(response.reset.resetUrl));
      }
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Unable to start password reset.";
      setForgotPasswordError(message);
    } finally {
      setIsRequestingForgotPassword(false);
    }
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    setIsLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
    setIsLogoutConfirmOpen(false);
    closeLoginModal();
    logout();
  };

  const openJoinEventModal = () => {
    if (!currentUser?.id) {
      toast.push({
        type: "error",
        title: "Login required",
        message: "Please sign in before joining an event.",
      });
      setIsMenuOpen(false);
      handleLoginClick();
      return;
    }

    setIsMenuOpen(false);
    setJoinEventCode("");
    setJoinEventError("");
    setIsJoinEventOpen(true);
  };

  const handleJoinEventSubmit = async (event) => {
    event.preventDefault();
    const code = String(joinEventCode || "").trim();

    if (!code) {
      setJoinEventError("Event code is required.");
      return;
    }

    try {
      setIsJoiningEvent(true);
      setJoinEventError("");
      const response = await joinEventWithCode(code);
      const joinedEventId = String(response?.event?.id || "").trim();

      const joinedSession = response?.session;
      if (joinedSession?.eventId && joinedSession?.expiresAt) {
        saveEventTimerSession({
          eventId: String(joinedSession.eventId),
          joinedAt: joinedSession.joinedAt,
          expiresAt: joinedSession.expiresAt,
          durationSeconds: Number(joinedSession.durationSeconds || 0),
          eventTitle: String(response?.event?.title || ""),
        });
      }

      if (joinedEventId) {
        try {
          window.localStorage.setItem(EVENT_ID_STORAGE_KEY, joinedEventId);
          const url = new URL(window.location.href);
          url.searchParams.set("eventId", joinedEventId);
          window.history.replaceState({}, "", url.toString());
          window.dispatchEvent(new PopStateEvent("popstate"));
          window.dispatchEvent(new Event("compiler-event-session-updated"));
        } catch {
          // Ignore browser storage/history limitations
        }
      }

      toast.push({
        type: "success",
        title: response?.alreadyJoined ? "Event already joined" : "Event joined",
        message: response?.event?.title
          ? `Active event: ${response.event.title}`
          : "You can now submit in this event.",
      });

      setIsJoinEventOpen(false);
      setJoinEventCode("");
      setJoinEventError("");
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Unable to join event";
      setJoinEventError(message);
    } finally {
      setIsJoiningEvent(false);
    }
  };

  const isStudentUser =
    !!currentUser && String(currentUser?.role || "").toLowerCase() === "student";
  const quickCountSuffix =
    isStudentUser && menuQuickCounts.loading && !menuQuickCounts.hasLoaded
      ? "(...)"
      : "";
  const myEventsMenuLabel = isStudentUser
    ? `My Events (${menuQuickCounts.joinedEvents})${quickCountSuffix}`
    : "My Events";
  const myCertificationsMenuLabel = isStudentUser
    ? `My Certification (${menuQuickCounts.certificates})${quickCountSuffix}`
    : "My Certification";
  const menuItemClass =
    "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium tracking-wide text-white/80 transition-colors hover:bg-white/10 hover:text-cyan-200";
  const menuItemDangerClass =
    "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium tracking-wide text-white/80 transition-colors hover:bg-red-500/20 hover:text-red-300";
  const menuIconClass =
    "h-4 w-4 shrink-0 text-white/70 transition-colors group-hover:text-current";

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:items-center sm:gap-3">
      <motion.button
        whileHover={{
          scale: 1.03,
          boxShadow:
            "0 0 0 2px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.4)",
        }}
        whileTap={{ scale: 0.98 }}
        disabled={isRunning}
        onClick={onRun}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-white transition-all hover:from-indigo-500 hover:to-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 sm:px-5 ${isRunning ? "opacity-60 cursor-not-allowed" : ""
          }`}
      >
        <Play size={18} strokeWidth={2.5} />
        <span className="text-sm font-semibold leading-none">Run</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        disabled={isSubmittingCode || (eventSessionState.active && eventSessionState.expired)}
        onClick={onSubmitCode}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-white transition-all hover:from-emerald-500 hover:to-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 sm:px-5 ${isSubmittingCode || (eventSessionState.active && eventSessionState.expired)
          ? "opacity-60 cursor-not-allowed"
          : ""
          }`}
      >
        <span className="text-sm font-semibold leading-none">
          {isSubmittingCode
            ? "Submitting..."
            : eventSessionState.active && eventSessionState.expired
              ? "Time Over"
              : "Submit"}
        </span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={clearIO}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white transition-colors hover:border-white/40 hover:bg-white/10 sm:px-4"
      >
        <RotateCcw size={18} strokeWidth={2} />
        <span className="hidden text-sm font-medium leading-none sm:inline">Clear</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={openDependencyModalAndDetect}
        className="hidden min-h-10 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white transition-colors hover:border-white/40 hover:bg-white/10 sm:inline-flex"
      >
        <span className="text-sm font-medium leading-none">Deps</span>
      </motion.button>

      {/* Notification badge right next to Deps */}
      <NotificationBadge />

      <div className="relative" ref={menuRef}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition-colors hover:border-cyan-400/50 hover:bg-white/10 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-white/20"
        >
          <MoreVertical size={18} strokeWidth={2} />
        </motion.button>

        {isMenuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-white/10 bg-black/95 p-1 text-sm text-white shadow-xl backdrop-blur">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              {currentUser ? "Account" : "Guest"}
            </div>
            {currentUser &&
              String(currentUser?.role || "").toLowerCase() === "student" && (
                <div className="mx-2 mb-2 rounded-md border border-white/10 bg-white/[0.04] p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-100/85">
                        <CalendarDays size={13} className="shrink-0" />
                        Events
                      </div>
                      <div className="mt-1 text-base font-semibold leading-none text-cyan-200">
                        {menuQuickCounts.loading && !menuQuickCounts.hasLoaded
                          ? "…"
                          : menuQuickCounts.joinedEvents}
                      </div>
                    </div>
                    <div className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100/85">
                        <BadgeCheck size={13} className="shrink-0" />
                        Certificates
                      </div>
                      <div className="mt-1 text-base font-semibold leading-none text-amber-200">
                        {menuQuickCounts.loading && !menuQuickCounts.hasLoaded
                          ? "…"
                          : menuQuickCounts.certificates}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            <button
              type="button"
              onClick={handleLoginClick}
              className={menuItemClass}
            >
              <UserCircle2 className={menuIconClass} />
              <span className="flex-1">{currentUser ? "Account" : "Login"}</span>
            </button>
            <button
              type="button"
              onClick={handleSettingsClick}
              className={menuItemClass}
            >
              <Settings className={menuIconClass} />
              <span className="flex-1">Settings</span>
            </button>
            <button
              type="button"
              onClick={openSubmissionHistory}
              className={menuItemClass}
            >
              <History className={menuIconClass} />
              <span className="flex-1">Submissions</span>
            </button>
            <button
              type="button"
              onClick={openJoinEventModal}
              className={menuItemClass}
            >
              <CalendarPlus className={menuIconClass} />
              <span className="flex-1">Join Event</span>
            </button>
            <button
              type="button"
              onClick={openMyEvents}
              className={menuItemClass}
            >
              <CalendarDays className={menuIconClass} />
              <span className="flex-1">{myEventsMenuLabel}</span>
            </button>
            <button
              type="button"
              onClick={openMyCertifications}
              className={menuItemClass}
            >
              <BadgeCheck className={menuIconClass} />
              <span className="flex-1">{myCertificationsMenuLabel}</span>
            </button>
            {String(currentUser?.role || "").toLowerCase() === "admin" && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/admin/dashboard");
                }}
                className={menuItemClass}
              >
                <Shield className={menuIconClass} />
                <span className="flex-1">Admin Panel</span>
              </button>
            )}
            <button
              type="button"
              onClick={openLeaderboard}
              className={menuItemClass}
            >
              <Trophy className={menuIconClass} />
              <span className="flex-1">Leaderboard</span>
            </button>
            <button
              type="button"
              onClick={handleExportToZip}
              className={menuItemClass}
            >
              <Download className={menuIconClass} />
              <span className="flex-1">Export</span>
            </button>
            {currentUser && (
              <button
                type="button"
                onClick={handleLogout}
                className={menuItemDangerClass}
              >
                <LogOut className={menuIconClass} />
                <span className="flex-1">Logout</span>
              </button>
            )}
          </div>
        )}
      </div>

      {isSettingsOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />
            <motion.div
              ref={settingsRef}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-gray-950/95 text-white shadow-2xl"
            >
              <div className="flex flex-col p-4 sm:p-5">
                <div className="mb-4">
                  <h3 className="text-base font-semibold tracking-wide sm:text-lg">Settings</h3>
                  <p className="mt-1 text-sm text-white/60">Personalize the editor experience.</p>
                </div>

                <div className="max-h-[48vh] overflow-y-auto pr-2 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Project Root
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                      <div className="flex-1 text-sm text-white/70 break-words">{serverSettings.projectRoot || 'Loading...'}</div>
                      <input
                        value={newRoot}
                        onChange={(e) => setNewRoot(e.target.value)}
                        placeholder="New root path"
                        className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await setProjectRoot(newRoot || serverSettings.projectRoot);
                            setServerSettings({ projectRoot: res.projectRoot });
                            setNewRoot('');
                            toast.push({ type: 'success', title: 'Project root updated', message: res.projectRoot });
                          } catch (err) {
                            toast.push({ type: 'error', title: 'Failed to update root', message: err?.response?.data?.error || err.message || String(err) });
                          }
                        }}
                        className="rounded bg-cyan-500 px-3 py-1 text-black text-sm font-medium"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Auto Save
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white/90">Enable Auto Save</p>
                        <p className="text-xs text-white/60">Automatically save active file every N seconds.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${autoSaveEnabled ? "bg-cyan-400/80" : "bg-white/15"
                            }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${autoSaveEnabled ? "translate-x-5" : "translate-x-1"
                              }`}
                          />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="3600"
                          value={autoSaveInterval}
                          onChange={(e) => setAutoSaveInterval(Number(e.target.value || 5))}
                          className="w-20 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-sm text-white outline-none"
                          title="Auto-save interval (seconds)"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Theme
                    </label>
                    <select
                      value={theme}
                      onChange={handleThemeChange}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 relative z-50"
                    >
                      {THEMES.map((option) => (
                        <option key={option.id} value={option.id} style={{ color: '#000' }}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Editor Font Size
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="10"
                        max="24"
                        value={editorFontSize}
                        onChange={handleFontSizeChange}
                        className="flex-1 accent-cyan-400"
                      />
                      <span className="w-10 text-right text-sm text-white/70">{editorFontSize}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white/90">Show Minimap</p>
                      <p className="text-xs text-white/60">Toggle the code overview gutter.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMinimap}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${showMinimap ? "bg-cyan-400/80" : "bg-white/15"
                        }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${showMinimap ? "translate-x-5" : "translate-x-1"
                          }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Word Wrap
                    </label>
                    <select
                      value={wordWrap}
                      onChange={handleWordWrapChange}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 relative z-50"
                    >
                      <option value="off" style={{ color: '#000' }}>Off</option>
                      <option value="on" style={{ color: '#000' }}>On</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white/90">Show Line Numbers</p>
                      <p className="text-xs text-white/60">Toggle gutter numbering.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleLineNumbers}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${showLineNumbers ? "bg-cyan-400/80" : "bg-white/15"
                        }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${showLineNumbers ? "translate-x-5" : "translate-x-1"
                          }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Tab Size
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="2"
                        max="8"
                        step="1"
                        value={tabSize}
                        onChange={handleTabSizeChange}
                        className="flex-1 accent-cyan-400"
                      />
                      <input
                        type="number"
                        min="2"
                        max="8"
                        value={tabSize}
                        onChange={handleTabSizeChange}
                        className="w-14 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-cyan-400/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Run Code Limit
                    </label>
                    <select
                      value={runLimit == null ? "unlimited" : String(runLimit)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "unlimited") setRunLimit(null);
                        else setRunLimit(Number(v));
                      }}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 relative z-50"
                    >
                      <option value="50" style={{ color: '#000' }}>50</option>
                      <option value="100" style={{ color: '#000' }}>100</option>
                      <option value="200" style={{ color: '#000' }}>200</option>
                      <option value="unlimited" style={{ color: '#000' }}>Unlimited</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Export Scope
                    </label>
                    <select
                      value={exportAllFiles ? "all" : "active"}
                      onChange={(e) => setExportAllFiles(e.target.value === "all")}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 relative z-50"
                    >
                      <option value="active" style={{ color: '#000' }}>Active file</option>
                      <option value="all" style={{ color: '#000' }}>All open files</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="px-6 pt-2 pb-4 border-t border-white/6 flex justify-end gap-2 bg-gradient-to-t from-black/10">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {isLoginOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeLoginModal}
            />
            <motion.div
              ref={loginRef}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 max-h-[90vh] w-full max-w-sm overflow-auto rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-6"
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-wide">
                  {currentUser
                    ? "Account"
                    : isForgotPasswordMode
                      ? "Forgot Password"
                      : authMode === "signin"
                        ? "Sign In"
                        : "Create Account"}
                </h3>
                <p className="mt-1 text-sm text-white/60">
                  {currentUser
                    ? "You are signed in. Manage your session here."
                    : isForgotPasswordMode
                      ? "Generate a password reset link for student or admin accounts."
                      : authMode === "signin"
                        ? "Sign in to sync preferences across sessions."
                        : "Create an account to sync preferences across sessions."}
                </p>
              </div>

              {currentUser ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Email
                    </p>
                    <p className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80">
                      {currentUser.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                      Name
                    </p>
                    <p className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80">
                      {currentUser.name}
                    </p>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeLoginModal}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeLoginModal();
                        handleLogout();
                      }}
                      className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              ) : isForgotPasswordMode ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                    >
                      Email
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      value={forgotPasswordEmail}
                      onChange={(event) => setForgotPasswordEmail(event.target.value)}
                      placeholder="ada@computing.org"
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                    />
                  </div>

                  {forgotPasswordError && (
                    <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {forgotPasswordError}
                    </p>
                  )}

                  {forgotPasswordNotice && (
                    <p className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                      {forgotPasswordNotice}
                    </p>
                  )}

                  {forgotPasswordResetUrl && (
                    <a
                      href={forgotPasswordResetUrl}
                      className="block break-all rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 underline underline-offset-2"
                    >
                      {forgotPasswordResetUrl}
                    </a>
                  )}

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeLoginModal}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                      disabled={isRequestingForgotPassword}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isRequestingForgotPassword}
                      className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isRequestingForgotPassword
                        ? "Generating…"
                        : "Generate reset link"}
                    </button>
                  </div>

                  <div className="mt-4 text-center text-xs text-white/60">
                    <span>Remembered your password?</span>{" "}
                    <button
                      type="button"
                      className="text-cyan-300 underline-offset-2 transition hover:text-cyan-200 hover:underline"
                      onClick={() => {
                        setIsForgotPasswordMode(false);
                        setForgotPasswordError("");
                        setForgotPasswordNotice("");
                        setForgotPasswordResetUrl("");
                        setForgotPasswordEmail(loginForm.email || "");
                        setLoginError("");
                        setLoginNotice("");
                        setAuthMode("signin");
                      }}
                    >
                      Back to sign in
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="login-role"
                      className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                    >
                      Role
                    </label>
                    <select
                      id="login-role"
                      name="role"
                      value={loginForm.role}
                      onChange={handleLoginFormChange}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                    >
                      <option value="student" style={{ color: "#000" }}>Student</option>
                      <option value="admin" style={{ color: "#000" }}>Admin</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                    >
                      Email
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={loginForm.email}
                      onChange={handleLoginFormChange}
                      placeholder="ada@computing.org"
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                    />
                  </div>

                  {authMode === "signup" && (
                    <div>
                      <label
                        htmlFor="login-name"
                        className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                      >
                        Name
                      </label>
                      <input
                        id="login-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={loginForm.name}
                        onChange={handleLoginFormChange}
                        placeholder="Ada Lovelace"
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                    >
                      Password
                    </label>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={loginForm.password}
                      onChange={handleLoginFormChange}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                    />
                  </div>

                  {loginError && (
                    <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {loginError}
                    </p>
                  )}

                  {loginNotice && (
                    <p className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                      {loginNotice}
                    </p>
                  )}

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeLoginModal}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                      disabled={isLoggingIn}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLoggingIn ? (authMode === "signin" ? "Signing In…" : "Creating…") : authMode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                  </div>

                  <div className="mt-4 text-center text-xs text-white/60">
                    {authMode === "signin" ? (
                      <>
                        <span>Don&apos;t have an account?</span>{" "}
                        <button
                          type="button"
                          className="text-cyan-300 underline-offset-2 transition hover:text-cyan-200 hover:underline"
                          onClick={() => {
                            setAuthMode("signup");
                            setLoginError("");
                            setLoginNotice("");
                          }}
                        >
                          Sign up
                        </button>
                        <span className="mx-1 text-white/40">•</span>
                        <button
                          type="button"
                          className="text-cyan-300 underline-offset-2 transition hover:text-cyan-200 hover:underline"
                          onClick={() => {
                            setIsForgotPasswordMode(true);
                            setForgotPasswordEmail(loginForm.email || "");
                            setForgotPasswordError("");
                            setForgotPasswordNotice("");
                            setForgotPasswordResetUrl("");
                            setLoginError("");
                            setLoginNotice("");
                          }}
                        >
                          Forgot password?
                        </button>
                      </>
                    ) : (
                      <>
                        <span>Already have an account?</span>{" "}
                        <button
                          type="button"
                          className="text-cyan-300 underline-offset-2 transition hover:text-cyan-200 hover:underline"
                          onClick={() => {
                            setAuthMode("signin");
                            setLoginError("");
                            setLoginNotice("");
                            setLoginForm((prev) => ({ ...prev, role: prev.role || "student" }));
                          }}
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </div>
                </form>
              )}
            </motion.div>
          </div>,
          document.body
        )}

      {isLeaderboardOpen && <Leaderboard onClose={() => setIsLeaderboardOpen(false)} />}
      {isLogoutConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsLogoutConfirmOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-gray-950/95 p-5 text-white shadow-2xl"
            >
              <h3 className="text-lg font-semibold tracking-wide">Confirm Logout</h3>
              <p className="mt-2 text-sm text-white/70">
                Are you sure you want to logout?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLogout}
                  className="rounded-lg bg-red-500/85 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      {isMyEventsOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsMyEventsOpen(false)}
            />
            <div
              ref={myEventsRef}
              className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-wide sm:text-lg">My Events</h3>
                <button
                  type="button"
                  onClick={() => setIsMyEventsOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80"
                >
                  Close
                </button>
              </div>

              {myEventsLoading ? (
                <p className="text-sm text-white/60">Loading your events...</p>
              ) : myEventsItems.length === 0 ? (
                <p className="text-sm text-white/60">No joined events found.</p>
              ) : (
                <div className="space-y-2">
                  {myEventsItems.map((item) => (
                    <div
                      key={String(item.id)}
                      className="rounded-lg border border-white/10 bg-black/35 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white/90">{item.title || "Untitled Event"}</p>
                          <p className="mt-1 text-xs text-white/70">{item.description || "No description"}</p>
                          <p className="mt-1 text-xs text-cyan-200">{fmtDateTime(item.startAt)} - {fmtDateTime(item.endAt)}</p>
                          <p className="mt-1 text-xs text-white/65">Joined: {fmtDateTime(item.joinedAt)} | Status: {item.attendanceStatus || "registered"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              activateEventById(item.id);
                              setIsMyEventsOpen(false);
                              toast.push({
                                type: "success",
                                title: "Event activated",
                                message: `Active event set to ${item.title || "selected event"}.`,
                              });
                            }}
                            className="rounded border border-cyan-400/40 px-2.5 py-1 text-xs text-cyan-200"
                          >
                            Use Event
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      {isMyCertificationsOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsMyCertificationsOpen(false)}
            />
            <div
              ref={myCertificationsRef}
              className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-wide sm:text-lg">My Certification</h3>
                <button
                  type="button"
                  onClick={() => setIsMyCertificationsOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80"
                >
                  Close
                </button>
              </div>

              {myCertificationsLoading ? (
                <p className="text-sm text-white/60">Loading your certifications...</p>
              ) : myCertificationsItems.length === 0 ? (
                <p className="text-sm text-white/60">No certificates issued yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-white/60">
                      <tr>
                        <th className="py-2 pr-3">Event</th>
                        <th className="py-2 pr-3">Rank</th>
                        <th className="py-2 pr-3">Merit</th>
                        <th className="py-2 pr-3">Certificate No</th>
                        <th className="py-2 pr-3">Verification Code</th>
                        <th className="py-2 pr-3">Issued</th>
                        <th className="py-2 pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myCertificationsItems.map((item) => (
                        <tr key={String(item.id)} className="border-t border-white/10">
                          <td className="py-2 pr-3 text-white">{item.eventId?.title || "-"}</td>
                          <td className="py-2 pr-3 text-white/80">{item.rank ?? "-"}</td>
                          <td className="py-2 pr-3 text-white/80">{item.merit || "none"}</td>
                          <td className="py-2 pr-3 text-white/80">{item.certificateNo || "-"}</td>
                          <td className="py-2 pr-3 text-white/80">{item.verificationCode || "-"}</td>
                          <td className="py-2 pr-3 text-white/70">{fmtDateTime(item.issuedAt)}</td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const code = String(item.verificationCode || "").trim();
                                  if (!code) return;
                                  try {
                                    await navigator.clipboard.writeText(code);
                                    toast.push({ type: "success", title: "Copied", message: "Verification code copied." });
                                  } catch {
                                    toast.push({ type: "error", title: "Copy failed", message: "Unable to copy verification code." });
                                  }
                                }}
                                className="rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-200"
                              >
                                Copy Code
                              </button>
                              <a
                                href={`/certificates/verify?code=${encodeURIComponent(String(item.verificationCode || ""))}`}
                                className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200"
                              >
                                Verify
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      {isJoinEventOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                setIsJoinEventOpen(false);
                setJoinEventCode("");
                setJoinEventError("");
              }}
            />
            <motion.div
              ref={joinEventRef}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-5"
            >
              <div className="mb-4">
                <h3 className="text-base font-semibold tracking-wide sm:text-lg">Join Event</h3>
                <p className="mt-1 text-sm text-white/60">
                  Enter event code provided by organizer.
                </p>
              </div>

              <form onSubmit={handleJoinEventSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="join-event-code"
                    className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300"
                  >
                    Event Code
                  </label>
                  <input
                    id="join-event-code"
                    type="text"
                    value={joinEventCode}
                    onChange={(e) => setJoinEventCode(e.target.value)}
                    placeholder="Paste event code"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
                  />
                </div>

                {joinEventError && (
                  <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {joinEventError}
                  </p>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsJoinEventOpen(false);
                      setJoinEventCode("");
                      setJoinEventError("");
                    }}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                    disabled={isJoiningEvent}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isJoiningEvent}
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isJoiningEvent ? "Joining..." : "Join Event"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>,
          document.body,
        )}
      {isSubmissionHistoryOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsSubmissionHistoryOpen(false)}
            />
            <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-wide sm:text-lg">Submission History</h3>
                <button
                  type="button"
                  onClick={() => setIsSubmissionHistoryOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80"
                >
                  Close
                </button>
              </div>

              {submissionHistoryLoading ? (
                <p className="text-sm text-white/60">Loading submissions...</p>
              ) : submissionHistoryItems.length === 0 ? (
                <p className="text-sm text-white/60">No submissions found.</p>
              ) : (
                <div className="space-y-2">
                  {submissionHistoryItems.map((item) => (
                    <div
                      key={String(item._id || `${item.problemId}-${item.createdAt}`)}
                      className="rounded-lg border border-white/10 bg-black/35 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white/90">
                          {item.status} • {item.language}
                        </div>
                        <div className="text-xs text-white/60">
                          {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/65">
                        Time: {Number(item.executionTime || 0)} ms
                      </div>
                      {item?.score && (
                        <div className="mt-1 text-xs text-cyan-200/80">
                          Score: {Number(item.score.earned || 0)} / {Number(item.score.total || 0)}
                          {` • Passed: ${Number(item.score.passedCount || 0)}/${Number(item.score.totalCount || 0)}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      {isDepsOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-black/60" onClick={() => setIsDepsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl sm:p-6"
            >
              <h3 className="text-lg font-semibold">Detected Dependencies</h3>
              <p className="mt-1 text-sm text-white/60">Review detected packages before installing (dry-run).</p>

              <div className="mt-4 max-h-64 overflow-auto rounded border border-white/6 bg-black/30 p-3 text-sm">
                {!depsDetected && <div className="text-white/60">Scanning project files...</div>}
                {depsDetected && depsDetected.error && (
                  <div className="text-red-400">Error: {depsDetected.error}</div>
                )}
                {depsDetected && !depsDetected.error && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-white/60">Node / JavaScript packages</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(depsDetected.node || []).length === 0 && <div className="text-white/50">None detected</div>}
                        {(depsDetected.node || []).map((p) => (
                          <span key={p} className="rounded bg-white/5 px-2 py-1 text-xs">{p}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Python packages</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(depsDetected.python || []).length === 0 && <div className="text-white/50">None detected</div>}
                        {(depsDetected.python || []).map((p) => (
                          <span key={p} className="rounded bg-white/5 px-2 py-1 text-xs">{p}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {depsInstallResult && (
                <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-xs text-white/75">
                  <div className="mb-2 font-semibold text-white/80">Install Output</div>
                  {depsInstallResult.error ? (
                    <div className="text-red-300">{depsInstallResult.error}</div>
                  ) : (
                    <div className="space-y-2">
                      {depsInstallResult.node ? (
                        <div>
                          <div className="text-cyan-200">Node exit code: {String(depsInstallResult.node.code ?? "-")}</div>
                          {depsInstallResult.node.stderr ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-red-200">{String(depsInstallResult.node.stderr)}</pre> : null}
                        </div>
                      ) : null}
                      {depsInstallResult.python ? (
                        <div>
                          <div className="text-cyan-200">Python exit code: {String(depsInstallResult.python.code ?? "-")}</div>
                          {depsInstallResult.python.stderr ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-red-200">{String(depsInstallResult.python.stderr)}</pre> : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepsOpen(false)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={
                    isInstallingDeps ||
                    !depsDetected ||
                    !!depsDetected.error ||
                    ((depsDetected?.node || []).length === 0 &&
                      (depsDetected?.python || []).length === 0)
                  }
                  onClick={installDetectedDependencies}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isInstallingDeps ? 'Installing…' : 'Install Detected Deps'}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </div>
  );
}
