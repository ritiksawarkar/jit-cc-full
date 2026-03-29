import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useCompilerStore } from "../store/useCompilerStore";
import { getAISuggestions, saveFile, renameFile, deleteFile } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Save, CheckCircle, AlertCircle } from "lucide-react";
import ProblemStatementPanel from "./ProblemStatementPanel";
import {
  getDefaultFileNameForMonaco,
  getMonacoLanguage,
} from "../lib/languageUtils";

// Basic collaborative client ID
const CLIENT_ID = typeof window !== 'undefined' ? (window.localStorage.getItem('collab-client-id') || (function () { const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; try { window.localStorage.setItem('collab-client-id', id); } catch { } return id; })()) : `srv-${Date.now()}`;

/**
 * EditorPanel with redesigned futuristic AI toolkit modal
 */
export default function EditorPanel({ compact = false } = {}) {
  const {
    source,
    setSource,
    theme,
    languageId,
    editorFontSize,
    showMinimap,
    wordWrap,
    showLineNumbers,
    tabSize,
    tabs,
    activeTabId,
    selectTab,
    updateTabContent,
    registerEditor,
    isSaving,
    setIsSaving,
    saveStatus,
    setSaveStatus,
    unsavedFiles,
    setUnsavedFile,
  } = useCompilerStore();
  const autoSaveEnabled = useCompilerStore((s) => s.autoSaveEnabled);
  const autoSaveInterval = useCompilerStore((s) => s.autoSaveInterval);
  const monaco = useMonaco();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aiMode, setAiMode] = useState("code-only");
  const [isLoading, setIsLoading] = useState(false);

  // --- Complete language mapping from Judge0 IDs to Monaco ---
  const monacoLang = useMemo(
    () => getMonacoLanguage(languageId),
    [languageId]
  );

  // Small hello-world snippets per Monaco language to prefill newly-created tabs
  const HELLO_WORLD_SNIPPETS = useMemo(() => ({
    javascript: `// Hello World - JavaScript (Node.js)\nconsole.log('Hello, world!');`,
    typescript: `// Hello World - TypeScript\nconsole.log('Hello, world!');`,
    python: `# Hello World - Python\nprint('Hello, world!')`,
    java: `// Hello World - Java\nclass Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello, world!\");\n  }\n}`,
    c: `#include <stdio.h>\nint main(){\n  printf(\"Hello, world!\\n\");\n  return 0;\n}`,
    cpp: `#include <iostream>\nint main(){\n  std::cout << \"Hello, world!\\n\";\n  return 0;\n}`,
    go: `package main\nimport \"fmt\"\nfunc main(){\n  fmt.Println(\"Hello, world!\")\n}`,
    ruby: `# Hello World - Ruby\nputs 'Hello, world!'`,
    php: `<?php\necho \"Hello, world!\\n\";`,
    rust: `fn main(){\n  println!(\"Hello, world!\");\n}`,
  }), []);

  const fileNaming = useMemo(() => {
    const name = getDefaultFileNameForMonaco(monacoLang);
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex === -1) {
      return { name, base: name, ext: "" };
    }
    return {
      name,
      base: name.slice(0, dotIndex),
      ext: name.slice(dotIndex + 1),
    };
  }, [monacoLang]);

  const [openMenuTabId, setOpenMenuTabId] = useState(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingError, setEditingError] = useState("");
  const tabCounterRef = useRef(1);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);
  const wsRef = useRef(null);
  const lastAppliedRemote = useRef({ filePath: null, timestamp: 0 });
  const debouncedSendRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const activeTabRef = useRef(null);
  const editingInputRef = useRef(null);
  const measureCanvasRef = useRef(null);

  // sizing constraints for the inline rename input
  const INPUT_MIN_WIDTH = 48; // px
  const INPUT_MAX_WIDTH = 240; // px

  const closeMenu = useCallback(() => {
    setOpenMenuTabId(null);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    // Open WebSocket connection once
    try {
      const url = (import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'http://127.0.0.1:9009') : 'http://127.0.0.1:9009')
        .replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'edit') {
            const { filePath, content, clientId, timestamp } = msg;
            // ignore our own edits
            if (clientId === CLIENT_ID) return;
            // apply if active tab matches
            const state = useCompilerStore.getState();
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            const activePath = activeTab?.path || activeTab?.name;
            if (!activePath) return;
            if (activePath === filePath) {
              // apply only if newer
              if ((timestamp || 0) > (lastAppliedRemote.current.timestamp || 0)) {
                // update store/monaco
                try {
                  if (state.updateTabContent) state.updateTabContent(state.activeTabId, String(content || ""));
                  if (state.setSource) state.setSource(String(content || ""));
                  lastAppliedRemote.current = { filePath, timestamp };
                } catch (e) { console.error('Failed to apply remote edit', e); }
              }
            }
          }
        } catch (e) { }
      });
    } catch (e) {
      console.warn('Collab WS init failed', e);
    }

    // keep default first tab name in sync with language
    // only when the first tab is not custom named
    try {
      const state = useCompilerStore.getState();
      const currentTabs = state.tabs || [];
      if (!currentTabs.length) return;
      const first = currentTabs[0];
      if (!first.isCustomName && first.name !== fileNaming.name) {
        // Instead of renaming, create a new tab for the newly selected language
        const createTab = state.createTab;
        // If first tab is empty content, replace its name; otherwise create a fresh tab
        if (!first.content || first.content.trim() === "") {
          // replace first tab name in state
          const updateState = useCompilerStore.setState;
          if (updateState) {
            updateState((s) => ({
              tabs: s.tabs.map((t, idx) => (idx === 0 ? { ...t, name: fileNaming.name } : t)),
            }));
          }
        } else if (createTab) {
          // create a new tab prefilled with default name and a language-appropriate snippet
          const snippet = HELLO_WORLD_SNIPPETS[monacoLang] ?? "";
          createTab({ name: fileNaming.name, content: snippet, isCustomName: false });
        }
      }
    } catch (e) {
      // ignore
    }
  }, [fileNaming.name, monacoLang]);

  // Subscribe/unsubscribe to WS file channel when active tab changes
  useEffect(() => {
    const state = useCompilerStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = activeTab?.path || activeTab?.name;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // If socket not open yet, wait and try subscribe when it opens
      if (ws) {
        const onOpen = () => {
          // send subscribe
          if (activePath) ws.send(JSON.stringify({ type: 'subscribe', filePath: activePath }));
        };
        ws.addEventListener('open', onOpen, { once: true });
      }
      return;
    }
    // unsubscribe previous subscriptions on ws side by clearing all and re-subscribing simple approach
    try { ws.send(JSON.stringify({ type: 'unsubscribe-all' })); } catch { }
    if (activePath) {
      try { ws.send(JSON.stringify({ type: 'subscribe', filePath: activePath })); } catch { }
    }

    return () => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN && activePath) {
          ws.send(JSON.stringify({ type: 'unsubscribe', filePath: activePath }));
        }
      } catch { }
    };
  }, [tabs, activeTabId]);

  // Send debounced edits when source changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const state = useCompilerStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = activeTab?.path || activeTab?.name;
    if (!activePath) return;

    const sendNow = () => {
      try {
        const payload = { type: 'edit', filePath: activePath, content: String(state.source || ''), clientId: CLIENT_ID, timestamp: Date.now() };
        ws.send(JSON.stringify(payload));
      } catch (e) { }
    };

    // debounce: 800ms
    if (debouncedSendRef.current) clearTimeout(debouncedSendRef.current);
    debouncedSendRef.current = setTimeout(sendNow, 800);
    return () => { if (debouncedSendRef.current) clearTimeout(debouncedSendRef.current); };
  }, [source, activeTabId, tabs]);

  useEffect(() => {
    // keep the active tab's content in sync with source
    // guard against redundant updates to avoid unnecessary store writes and re-renders
    if (!activeTabId) return;
    try {
      const state = useCompilerStore.getState();
      const tab = state.tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      if (tab.content === source) return;
    } catch (err) {
      // ignore lookup errors
    }
    updateTabContent(activeTabId, String(source ?? ""));
  }, [source, activeTabId]);

  // Auto-scroll to active tab with smooth animation
  useEffect(() => {
    // Avoid using element.scrollIntoView which can trigger page-level scrolling in some browsers.
    // Instead, compute and set the tabsContainerRef.scrollLeft so only the tab bar scrolls.
    if (activeTabRef.current && tabsContainerRef.current) {
      try {
        const container = tabsContainerRef.current;
        const active = activeTabRef.current;
        const containerRect = container.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();

        const offsetLeft = activeRect.left - containerRect.left;
        const offsetRight = activeRect.right - containerRect.right;

        // If active tab is to the left of container viewport, scroll left
        if (offsetLeft < 0) {
          container.scrollTo({ left: container.scrollLeft + offsetLeft - 12, behavior: 'smooth' });
        } else if (offsetRight > 0) {
          // If active tab is to the right of container viewport, scroll right
          container.scrollTo({ left: container.scrollLeft + offsetRight + 12, behavior: 'smooth' });
        }
      } catch (err) {
        // Fallback to scrollIntoView if anything goes wrong (non-fatal)
        try {
          activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } catch { }
      }
    }
  }, [activeTabId]);

  const generateFileName = (sequence) => {
    if (sequence === 1) {
      return fileNaming.name;
    }
    const suffix = `_${sequence}`;
    return fileNaming.ext
      ? `${fileNaming.base}${suffix}.${fileNaming.ext}`
      : `${fileNaming.base}${suffix}`;
  };

  const generateDuplicateName = (baseName, existingTabs) => {
    const extIndex = baseName.lastIndexOf(".");
    const baseSegment = extIndex !== -1 ? baseName.slice(0, extIndex) : baseName;
    const extSegment = extIndex !== -1 ? baseName.slice(extIndex) : "";
    const safeBase = baseSegment || "untitled";
    const taken = new Set(existingTabs.map((tab) => tab.name));
    let counter = 1;
    let candidate = `${safeBase} Copy${extSegment}`;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${safeBase} Copy ${counter}${extSegment}`;
    }
    return candidate;
  };

  const handleDuplicateTab = (tabId) => {
    // delegate to store
    try {
      const dup = useCompilerStore.getState().duplicateTab;
      if (dup) dup(tabId);
    } catch (e) {
      // fallback: no-op
    }
    closeMenu();
  };

  const handleCloseOthers = (tabId) => {
    try {
      const closeOthers = useCompilerStore.getState().closeOthers;
      if (closeOthers) closeOthers(tabId);
    } catch (e) { }
    closeMenu();
  };

  const handleCloseAll = () => {
    try {
      const closeAll = useCompilerStore.getState().closeAll;
      if (closeAll) closeAll();
    } catch (e) { }
    closeMenu();
  };

  const handleDeleteTab = (tabId) => {
    try {
      const state = useCompilerStore.getState();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (!window.confirm(`Are you sure you want to delete '${tab.name}' from disk and close the tab?`)) {
        closeMenu();
        return;
      }
      // Attempt backend delete - prefer full tab.path when available
      try {
        const fileToDelete = tab.path || tab.name;
        deleteFile(fileToDelete)
          .then(() => {
            const del = useCompilerStore.getState().deleteTab;
            if (del) del(tabId);
            // Notify explorer to reload
            try {
              window.dispatchEvent(new CustomEvent("project-structure-changed"));
            } catch { }
          })
          .catch((err) => {
            console.error("Delete file API failed:", err);
            alert(`Failed to delete file: ${err?.response?.data?.error || err.message || err}`);
          });
      } catch (err) {
        console.error("Delete API error:", err);
      }
    } catch (e) { }
    if (openMenuTabId === tabId) {
      closeMenu();
    }
  };

  const handleSelectTab = (tabId) => {
    try {
      const sel = useCompilerStore.getState().selectTab;
      if (sel) sel(tabId);
    } catch (e) { }
    closeMenu();
  };
  const handleAddTab = () => {
    try {
      const add = useCompilerStore.getState().addTab;
      if (add) add();
    } catch (e) { }
    closeMenu();
  };

  const handleCloseTab = (tabId) => {
    try {
      const closeT = useCompilerStore.getState().closeTab;
      if (closeT) closeT(tabId);
    } catch (e) { }
    if (openMenuTabId === tabId) {
      closeMenu();
    }
  };

  const handleRenameTab = (tabId) => {
    // Start inline rename in the tab label (no browser prompt)
    handleStartInlineRename(tabId);
    closeMenu();
  };

  const activeMenuTab = useMemo(() => {
    return (tabs || []).find((tab) => tab.id === openMenuTabId) ?? null;
  }, [tabs, openMenuTabId]);

  useEffect(() => {
    if (!openMenuTabId) return;

    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        closeMenu();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    const handleViewportChange = () => {
      closeMenu();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [openMenuTabId, closeMenu]);

  const handleStartInlineRename = (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setEditingTabId(tabId);
    setEditingValue(tab.name);
    setEditingError("");
  };

  // Measure and apply width to the inline rename input so it matches text length.
  useLayoutEffect(() => {
    const input = editingInputRef.current;
    if (!input) return;

    try {
      // prepare canvas
      const canvas = measureCanvasRef.current || document.createElement('canvas');
      measureCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');
      const style = window.getComputedStyle(input);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.font = font;
      const text = editingValue || input.placeholder || input.value || '';
      const metrics = ctx.measureText(text);
      const paddingH = 18; // account for input horizontal padding and caret
      let width = Math.ceil(metrics.width + paddingH);
      if (width < INPUT_MIN_WIDTH) width = INPUT_MIN_WIDTH;
      if (width > INPUT_MAX_WIDTH) width = INPUT_MAX_WIDTH;
      input.style.width = `${width}px`;
    } catch (err) {
      // fallback: let CSS control width
      input.style.width = '';
    }
  }, [editingTabId, editingValue]);

  const handleCancelInlineRename = () => {
    setEditingTabId(null);
    setEditingValue("");
    setEditingError("");
  };

  const handleConfirmInlineRename = async (tabId) => {
    const trimmed = (editingValue || "").trim();
    if (!trimmed) {
      setEditingError("Please provide a name");
      return;
    }
    const extMatch = trimmed.match(/\.([a-z0-9]+)$/i);
    if (!extMatch) {
      setEditingError("File extension required (e.g. main.cpp)");
      return;
    }
    const ext = extMatch[1].toLowerCase();
    const allowedExts = new Set(["js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "rs", "go", "html", "css", "json", "md", "txt", "sh", "bash", "yml", "yaml"]);
    if (!allowedExts.has(ext)) {
      setEditingError(`Unsupported extension '.${ext}'.`);
      return;
    }
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) { handleCancelInlineRename(); return; }
    try {
      const oldPath = tab.path || tab.name;
      const resp = await renameFile(oldPath, trimmed);
      const rn = useCompilerStore.getState().renameTab;
      if (rn) rn(tabId, trimmed, resp?.newPath || undefined);
      try { window.dispatchEvent(new CustomEvent("project-structure-changed")); } catch { }
      handleCancelInlineRename();
    } catch (err) {
      console.error("Rename failed:", err);
      setEditingError(err?.response?.data?.error || err.message || String(err));
    }
  };

  // AI Toolkit request handler — calls backend AI suggestions and inserts result into editor
  const handleAIRequest = async () => {
    const promptText = (prompt || "").trim();
    if (!promptText) {
      alert("Please enter a prompt for the AI Toolkit.");
      return;
    }

    setIsLoading(true);
    try {
      const resp = await getAISuggestions(promptText, {
        mode: aiMode,
        language: monacoLang,
      });
      const responseCode = String(resp?.codeBlock || "").trim();
      const responseExplanation = String(
        resp?.explanation || resp?.suggestions || "",
      ).trim();

      if (aiMode === "code-only") {
        const finalCode =
          responseCode || String(resp?.suggestions || resp?.result || "").trim();
        if (!finalCode) {
          alert("AI returned no code.");
          return;
        }
        try {
          const state = useCompilerStore.getState();
          const activeId = state.activeTabId;
          setSource(finalCode);
          if (activeId && state.updateTabContent) {
            state.updateTabContent(activeId, finalCode);
          }
        } catch (e) {
          console.error("Failed to replace editor content with AI code:", e);
          setSource(finalCode);
        }
        return;
      }

      const explanationToInsert = responseExplanation;
      const codeToInsert = responseCode;
      if (!explanationToInsert && !codeToInsert) {
        alert("AI returned no suggestions.");
        return;
      }

      try {
        const state = useCompilerStore.getState();
        const activeId = state.activeTabId;
        const currSource = String(state.source ?? "");
        const segments = [];
        if (explanationToInsert) {
          segments.push(`// AI Explanation:\n${explanationToInsert}`);
        }
        if (codeToInsert) {
          segments.push(codeToInsert);
        }
        const block = segments.join("\n\n");
        const newContent = currSource ? `${currSource}\n\n${block}` : block;
        try {
          setSource(newContent);
        } catch (e) {
          console.error("Failed to set source safely:", e);
        }

        if (activeId && state.updateTabContent) {
          try {
            const tabContent = String(
              state.tabs.find((t) => t.id === activeId)?.content ?? "",
            );
            const nextTabContent = tabContent
              ? `${tabContent}\n\n${block}`
              : block;
            state.updateTabContent(activeId, nextTabContent);
          } catch (e) {
            console.error("Failed to update tab content safely:", e);
          }
        }
      } catch (e) {
        console.error("Failed to insert AI suggestion into editor/state:", e);
        try {
          setSource(codeToInsert || explanationToInsert);
        } catch (err) {
          console.error(err);
        }
      }
    } catch (err) {
      // Handle axios cancellation (or other cancellation shapes) gracefully
      const isCancel = err?.type === 'cancelation' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled';
      if (isCancel) {
        console.info('AI request was canceled by the client or worker.');
      } else {
        console.error("AI request failed:", err);
        try {
          alert(`AI request failed: ${err?.response?.data?.error || err.message || String(err)}`);
        } catch { }
      }
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!activeTabId || !source) return;

    // Get active tab to determine file path
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    // Construct file path from tab.path if available, otherwise from tab.name
    // Ensure project-relative path (no leading slash)
    const rawPath = activeTab.path || activeTab.name;
    const filePath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const result = await saveFile(filePath, source);
      if (result.success) {
        setSaveStatus("success");
        setUnsavedFile(activeTabId, false);
        // Clear success message after 2 seconds
        setTimeout(() => setSaveStatus(null), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [activeTabId, source, tabs, setIsSaving, setSaveStatus, setUnsavedFile]);

  // Add Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Auto-save effect: periodically save active tab when enabled and there are unsaved changes
  useEffect(() => {
    if (!autoSaveEnabled) return;
    let mounted = true;
    const intervalMs = Math.max(1, Number(autoSaveInterval || 5)) * 1000;
    const tick = async () => {
      try {
        const state = useCompilerStore.getState();
        const activeId = state.activeTabId;
        if (!activeId) return;
        // only save if unsaved flag present
        const need = state.unsavedFiles?.[activeId];
        if (!need) return;
        const tab = state.tabs.find((t) => t.id === activeId);
        if (!tab) return;
        // determine file path
        const rawPath = tab.path || tab.name || "";
        const filePath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
        const content = String(tab.content ?? state.source ?? "");
        try {
          // optimistic UI
          setIsSaving(true);
          setSaveStatus(null);
          const res = await saveFile(filePath, content);
          if (res?.success) {
            setSaveStatus("success");
            setUnsavedFile(activeId, false);
            setTimeout(() => setSaveStatus(null), 1500);
          }
        } catch (err) {
          console.error("Auto-save failed:", err);
          setSaveStatus("error");
          setTimeout(() => setSaveStatus(null), 2000);
        } finally {
          setIsSaving(false);
        }
      } catch (e) {
        // swallow
      }
    };

    const id = setInterval(() => { if (mounted) tick(); }, intervalMs);
    // run once immediately
    tick();
    return () => { mounted = false; clearInterval(id); };
  }, [autoSaveEnabled, autoSaveInterval, setIsSaving, setSaveStatus, setUnsavedFile]);

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="text-sm text-white/80 mb-2 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-wide">Editor</span>
        <div className="flex items-center gap-3">
          {/* Save Button with Status Indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-emerald-600/50 px-3 py-2 rounded-lg text-white font-semibold shadow-lg transition-all duration-200 border border-emerald-400/30 disabled:opacity-60"
              title="Save current file (Ctrl+S)"
            >
              <Save size={16} />
              <span className="text-sm">Save</span>
            </button>

            {/* Status Indicator */}
            {saveStatus === "success" && (
              <div className="flex items-center gap-1 text-emerald-400 animate-pulse">
                <CheckCircle size={16} />
                <span className="text-xs">Saved</span>
              </div>
            )}
            {saveStatus === "error" && (
              <div className="flex items-center gap-1 text-red-400">
                <AlertCircle size={16} />
                <span className="text-xs">Failed</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 rounded-lg text-white font-semibold shadow-lg hover:scale-105 transition-all duration-200 border border-cyan-400/30 hover:border-cyan-400/60"
          >
            <span className="flex items-center gap-2">
              <span>AI Toolkit</span>
              <span className="text-cyan-300">⟫</span>
            </span>
          </button>
        </div>
      </div>

      {/* VS Code style tab bar - make flush with editor (no gap) */}
      <div className="flex items-center gap-2 border border-white/10 border-b-0 rounded-t-xl overflow-hidden">
        <div
          ref={tabsContainerRef}
          className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-nowrap scroll-smooth bg-transparent"
          style={{ scrollbarWidth: 'thin' }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const menuOpen = openMenuTabId === tab.id;
            return (
              <div
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                className="relative inline-flex items-center"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTab(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectTab(tab.id);
                    }
                    if (event.key === "Escape") {
                      closeMenu();
                    }
                  }}
                  className={`group inline-flex items-center rounded-t-lg border px-4 py-2 shadow-inner transition-colors ${isActive
                    ? "border-white/10 border-b-0 bg-black/60 text-cyan-100"
                    : "border-transparent bg-black/30 text-white/60 hover:border-white/10 hover:bg-black/50 hover:text-cyan-100"
                    }`}
                >
                  {editingTabId === tab.id ? (
                    <input
                      ref={editingInputRef}
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirmInlineRename(tab.id);
                        if (e.key === "Escape") handleCancelInlineRename();
                      }}
                      className="text-sm font-medium tracking-wide bg-black/20 px-2 py-1 rounded outline-none text-white"
                    />
                  ) : (
                    <span className="text-sm font-medium tracking-wide whitespace-nowrap">{tab.name}</span>
                  )}
                  {unsavedFiles[tab.id] && (
                    <span className="ml-2 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" title="Unsaved changes"></span>
                  )}
                  <button
                    type="button"
                    className={`ml-3 flex h-6 w-6 items-center justify-center rounded text-white/40 transition ${menuOpen
                      ? "bg-white/10 text-cyan-200"
                      : "hover:bg-white/10 hover:text-cyan-100"
                      }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (openMenuTabId === tab.id) {
                        closeMenu();
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      setMenuPosition({
                        top: rect.top + rect.height / 2 + window.scrollY,
                        left: rect.right + 12 + window.scrollX,
                      });
                      setOpenMenuTabId(tab.id);
                    }}
                  >
                    ⋮
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add tab button inside the scroll area so it stays inline with tabs */}
          <button
            type="button"
            onClick={handleAddTab}
            className="inline-flex items-center justify-center rounded border border-dashed border-white/10 px-3 py-2 text-sm text-white/40 transition hover:border-cyan-400/40 hover:text-cyan-200"
            aria-label="Add tab"
          >
            +
          </button>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {openMenuTabId && menuPosition && activeMenuTab && (
            <motion.div
              key="tab-menu"
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed z-50 w-56 rounded-xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                transform: "translateY(-50%)",
              }}
            >
              <div className="pb-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/40">
                File Menu
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-cyan-100"
                  onClick={() => handleRenameTab(activeMenuTab.id)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-cyan-100"
                  onClick={() => handleDuplicateTab(activeMenuTab.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={tabs.length <= 1}
                  className={`w-full rounded px-3 py-2 text-left text-sm transition ${tabs.length > 1
                    ? "text-white/80 hover:bg-white/10 hover:text-cyan-100"
                    : "cursor-not-allowed text-white/25"
                    }`}
                  onClick={() => {
                    if (tabs.length > 1) {
                      handleCloseTab(activeMenuTab.id);
                    }
                  }}
                >
                  Close Tab
                </button>
                <button
                  type="button"
                  disabled={tabs.length <= 1}
                  className={`w-full rounded px-3 py-2 text-left text-sm transition ${tabs.length > 1
                    ? "text-white/80 hover:bg-white/10 hover:text-cyan-100"
                    : "cursor-not-allowed text-white/25"
                    }`}
                  onClick={() => {
                    if (tabs.length > 1) {
                      handleCloseOthers(activeMenuTab.id);
                    }
                  }}
                >
                  Close Others
                </button>
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-cyan-100"
                  onClick={handleCloseAll}
                >
                  Close All
                </button>
                <div className="border-t border-white/10 pt-1" />
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/20"
                  onClick={() => handleDeleteTab(activeMenuTab.id)}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <PanelGroup direction="vertical" className="flex-1 flex flex-col gap-2">
        <Panel defaultSize={65} minSize={35} className="flex">
          <div className="flex-1 overflow-hidden rounded-b-xl border border-white/10 border-t-0 shadow-2xl">
            <Editor
              value={source}
              onMount={(editor, monacoInstance) => {
                // register instances in store for actions like revealPosition
                registerEditor(editor, monacoInstance);
              }}
              onChange={(v) => {
                setSource(String(v ?? ""));
                // update current active tab content
                try {
                  const st = useCompilerStore.getState();
                  if (st && st.activeTabId) {
                    st.updateTabContent(st.activeTabId, String(v ?? ""));
                    // Mark as unsaved
                    setUnsavedFile(st.activeTabId, true);
                  }
                } catch (e) { }
              }}
              height="100%"
              language={monacoLang}
              theme={theme}
              options={{
                fontFamily: "JetBrains Mono",
                fontSize: editorFontSize,
                minimap: { enabled: showMinimap },
                wordWrap,
                lineNumbers: showLineNumbers ? "on" : "off",
                tabSize,
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                automaticLayout: true,
              }}
            />
          </div>
        </Panel>
        {!compact && (
          <>
            <PanelResizeHandle className="h-2 rounded bg-white/5 transition-colors hover:bg-white/10" />
            <Panel defaultSize={35} minSize={15} className="flex">
              <div className="min-h-0 flex-1">
                <ProblemStatementPanel />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Inline rename implemented in tab labels (no modal) */}

      {/* Futuristic Toolkit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-end p-3 pt-16 sm:p-4 sm:pt-20">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Toolkit Panel */}
            <motion.div
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-[92vw] max-w-sm rounded-xl border border-cyan-500/30 bg-gray-900/95 backdrop-blur-xl shadow-2xl"
            >
              {/* Sharp angled header */}
              <div className="relative bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3 rounded-t-xl border-b border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                    <h3 className="text-cyan-100 font-bold text-sm tracking-wide">
                      ESM AI
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-cyan-200 hover:text-white transition-colors duration-150"
                  >
                    ×
                  </button>
                </div>
                <div className="absolute -bottom-1 left-4 w-3 h-3 bg-gray-900 rotate-45 border-b border-r border-cyan-500/30"></div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                    MODE
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiMode("code-only")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold tracking-wide transition-colors ${aiMode === "code-only"
                          ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100"
                          : "border-white/15 bg-gray-800/70 text-white/70 hover:bg-gray-700/70"
                        }`}
                    >
                      CODE ONLY
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiMode("with-explanation")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold tracking-wide transition-colors ${aiMode === "with-explanation"
                          ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100"
                          : "border-white/15 bg-gray-800/70 text-white/70 hover:bg-gray-700/70"
                        }`}
                    >
                      EXPLAIN
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                    PROMPT ENGINE
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your code requirements..."
                    className="w-full h-24 p-3 rounded-lg bg-gray-800/80 border border-cyan-500/20 text-cyan-100 font-mono text-sm outline-none resize-none placeholder:text-cyan-100/40 focus:border-cyan-400/40 focus:ring-1 ring-cyan-400/20 transition-all duration-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleAIRequest();
                      }
                    }}
                  />
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cyan-400/70 font-mono">
                    {isLoading ? "[PROCESSING...]" : "[READY]"}
                  </span>
                  <span className="text-cyan-400/50 font-mono">CTRL+ENTER</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700/80 hover:bg-gray-600/80 border border-gray-600 text-cyan-100 font-semibold text-sm transition-all duration-200 hover:border-gray-500"
                  >
                    ABORT
                  </button>
                  <button
                    onClick={handleAIRequest}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 border border-cyan-400/30 text-white font-bold text-sm shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                        GENERATING...
                      </span>
                    ) : (
                      "EXECUTE"
                    )}
                  </button>
                </div>
              </div>

              {/* Glow effect */}
              <div className="absolute inset-0 rounded-xl border border-cyan-400/10 pointer-events-none"></div>
              <div className="absolute -inset-1 rounded-xl bg-cyan-500/5 blur-sm pointer-events-none"></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
