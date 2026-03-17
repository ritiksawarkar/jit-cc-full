import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCompilerStore } from "../store/useCompilerStore";
import {
  executeCode,
  fetchUserSubmissions,
  getSettings,
  loginWithEmail,
  setProjectRoot,
  signupWithEmail,
  submitCode,
} from "../services/api";
import { useToast } from "./ToastProvider";
import { motion } from "framer-motion";
import { Play, RotateCcw, MoreVertical } from "lucide-react";
import { resolveDependencies } from "../services/api";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getDefaultFileNameForLanguage } from "../lib/languageUtils";
import { THEMES } from "../lib/languageMap";
import Leaderboard from './Leaderboard';
import { submitScore } from '../services/api';

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
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isSubmissionHistoryOpen, setIsSubmissionHistoryOpen] = useState(false);
  const [submissionHistoryLoading, setSubmissionHistoryLoading] = useState(false);
  const [submissionHistoryItems, setSubmissionHistoryItems] = useState([]);
  const menuRef = useRef(null);
  const settingsRef = useRef(null);
  const loginRef = useRef(null);

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
      language_id: active?.languageId ?? latestState.languageId ?? languageId,
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

    try {
      setIsSubmittingCode(true);
      const response = await submitCode({
        problemId: hasValidProblemId ? problemId : undefined,
        language_id: payload.language_id,
        language: String(payload.language_id),
        sourceCode: payload.source_code,
        input: payload.stdin,
      });

      const execution = response?.execution || {};
      setResult({
        status: execution.status || { description: response?.submission?.status || "Submitted" },
        stdout: execution.stdout || response?.submission?.output || "",
        stderr: execution.stderr || "",
        compile_output: execution.compile_output || "",
        time: response?.submission?.executionTime
          ? String(Number(response.submission.executionTime) / 1000)
          : "",
        memory: response?.submission?.memory || null,
      });

      toast.push({
        type: "success",
        title: "Submission saved",
        message: `Status: ${response?.submission?.status || "Saved"}`,
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
        setLoginForm({ email: "", password: "" });
        setLoginError("");
        setIsLoginOpen(false);
        setLoginNotice("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLoggingIn(false);
        setLoginForm({ email: "", password: "" });
        setLoginError("");
        setLoginNotice("");
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
  const toast = useToast();
  const [serverSettings, setServerSettings] = useState({ projectRoot: '' });
  const [newRoot, setNewRoot] = useState('');

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
    setAuthMode("signin");
    setLoginForm({ name: currentUser?.name || "", email: currentUser?.email || "", password: "" });
    setIsLoginOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginOpen(false);
    setLoginError("");
    setLoginNotice("");
    setIsLoggingIn(false);
    setAuthMode("signin");
    setLoginForm({ name: "", email: "", password: "" });
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
        setAuthSession({ user: data.user, token: data.token });
        closeLoginModal();
      } else {
        // signup
        const trimmedName = loginForm.name.trim();
        if (!trimmedName) {
          setLoginError("Name is required for signup.");
          setIsLoggingIn(false);
          return;
        }
        const data = await signupWithEmail({ name: trimmedName, email: trimmedEmail, password: trimmedPassword });
        // After successful signup, open the Sign In modal so the user can sign in manually
        try { toast.push({ type: 'success', title: 'Account created', message: 'Please sign in to continue.' }); } catch (e) { }
        setAuthMode('signin');
        setLoginForm({ name: '', email: trimmedEmail, password: '' });
        setLoginNotice('Account created. Please sign in.');
        setIsLoginOpen(true);
        setIsLoggingIn(false);
      }
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || "Authentication failed";
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
      <motion.button
        whileHover={{
          scale: 1.03,
          boxShadow:
            "0 0 0 2px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.4)",
        }}
        whileTap={{ scale: 0.98 }}
        disabled={isRunning}
        onClick={onRun}
        className={`min-h-10 rounded-xl bg-indigo-600 px-3 py-2 text-white transition sm:px-4 flex items-center gap-2 hover:bg-indigo-500 ${isRunning ? "opacity-70 cursor-not-allowed" : ""
          }`}
      >
        <Play size={18} />
        <span className="text-sm font-semibold">{isRunning ? "Running…" : "Run"}</span>
        <span className="hidden text-sm text-white/90 sm:inline">Code</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        disabled={isSubmittingCode}
        onClick={onSubmitCode}
        className={`min-h-10 rounded-xl bg-emerald-600 px-3 py-2 text-white transition sm:px-4 flex items-center gap-2 hover:bg-emerald-500 ${isSubmittingCode ? "opacity-70 cursor-not-allowed" : ""
          }`}
      >
        <span className="text-sm font-semibold">{isSubmittingCode ? "Submitting..." : "Submit"}</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={clearIO}
        className="min-h-10 rounded-xl bg-white/10 px-3 py-2 text-white transition hover:bg-white/20 flex items-center gap-2"
      >
        <RotateCcw size={18} />
        <span className="hidden text-sm sm:inline">Clear IO</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={async () => {
          setIsDepsOpen(true);
          setDepsDetected(null);
          try {
            const active = (tabs || []).find((t) => t.id === activeTabId) || null;
            const src = (active?.content ?? source) || '';
            const data = await resolveDependencies({ language: 'auto', source: src, scanProject: true, dryRun: true, action: 'detect' });
            setDepsDetected(data?.installResults?.detected || data?.detected || { node: [], python: [] });
          } catch (err) {
            setDepsDetected({ error: (err?.response?.data?.error || err?.message || String(err)) });
          }
        }}
        className="min-h-10 rounded-xl bg-white/10 px-3 py-2 text-white transition hover:bg-white/20 flex items-center gap-2"
      >
        <span className="text-sm font-medium">Deps</span>
      </motion.button>

      <div className="relative" ref={menuRef}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white transition hover:border-cyan-300/50 hover:text-cyan-200"
        >
          <MoreVertical size={18} />
        </motion.button>

        {isMenuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-lg border border-white/10 bg-black/85 p-2 text-sm text-white shadow-lg backdrop-blur">
            <div className="px-3 pb-2 text-xs uppercase tracking-wider text-white/40">
              {currentUser ? "Signed In" : "Guest Mode"}
            </div>
            <button
              type="button"
              onClick={handleLoginClick}
              className="w-full rounded px-3 py-2 text-left transition hover:bg-white/10 hover:text-cyan-200"
            >
              {currentUser ? "Account" : "Login"}
            </button>
            <button
              type="button"
              onClick={handleSettingsClick}
              className="w-full rounded px-3 py-2 text-left transition hover:bg-white/10 hover:text-cyan-200"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={openSubmissionHistory}
              className="w-full rounded px-3 py-2 text-left transition hover:bg-white/10 hover:text-cyan-200"
            >
              Submissions
            </button>
            <button
              type="button"
              onClick={openLeaderboard}
              className="w-full rounded px-3 py-2 text-left transition hover:bg-white/10 hover:text-cyan-200"
            >
              Leaderboard
            </button>
            {currentUser && (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded px-3 py-2 text-left transition hover:bg-red-500/20 hover:text-red-200"
              >
                Logout
              </button>
            )}
            <button
              type="button"
              onClick={handleExportToZip}
              className="w-full rounded px-3 py-2 text-left transition hover:bg-white/10 hover:text-cyan-200"
            >
              Export to Zip
            </button>
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
              className="relative z-10 max-h-[90vh] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gray-950/95 text-white shadow-2xl"
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
                  {currentUser ? "Account" : "Sign In"}
                </h3>
                <p className="mt-1 text-sm text-white/60">
                  {currentUser
                    ? "You are signed in. Manage your session here."
                    : "Sign in to sync preferences across sessions."}
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
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
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
                  disabled={isInstallingDeps || !depsDetected || depsDetected.error}
                  onClick={async () => {
                    if (!depsDetected) return;
                    setIsInstallingDeps(true);
                    try {
                      const active = (tabs || []).find((t) => t.id === activeTabId) || null;
                      const src = (active?.content ?? source) || '';
                      const res = await resolveDependencies({ language: 'auto', source: src, scanProject: true, dryRun: false, action: 'install' });
                      try { toast.push({ type: 'success', title: 'Install finished', message: 'Dependencies installed (see console)' }); } catch { }
                      console.log('Deps install result', res);
                      setIsDepsOpen(false);
                    } catch (err) {
                      try { toast.push({ type: 'error', title: 'Install failed', message: err?.response?.data?.error || err?.message || String(err) }); } catch { }
                      console.error('Install error', err);
                    } finally {
                      setIsInstallingDeps(false);
                    }
                  }}
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
