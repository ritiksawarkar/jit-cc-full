import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useCompilerStore } from "../store/useCompilerStore";
import { getAISuggestions } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  getDefaultFileNameForMonaco,
  getMonacoLanguage,
} from "../lib/languageUtils";

/**
 * EditorPanel with redesigned futuristic AI toolkit modal
 */
export default function EditorPanel() {
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
  } = useCompilerStore();
  const monaco = useMonaco();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const defaultProblemStatement = `Smart India Hackathon 2025: Develop a unified citizen service portal that aggregates schemes, eligibility checks, and application tracking across central and state departments. The solution should
- provide multilingual support for at least three Indian languages,
- leverage AI to recommend relevant schemes based on user profiles,
- ensure accessibility for low-bandwidth regions, and
- offer secure integrations for departmental data exchange via open APIs.`;
  const [problemStatement, setProblemStatement] = useState(defaultProblemStatement);

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
  const tabCounterRef = useRef(1);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const activeTabRef = useRef(null);

  const closeMenu = useCallback(() => {
    setOpenMenuTabId(null);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
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
    updateTabContent(activeTabId, source);
  }, [source, activeTabId]);

  // Auto-scroll to active tab with smooth animation
  useEffect(() => {
    if (activeTabRef.current && tabsContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
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
    } catch (e) {}
    closeMenu();
  };

  const handleCloseAll = () => {
    try {
      const closeAll = useCompilerStore.getState().closeAll;
      if (closeAll) closeAll();
    } catch (e) {}
    closeMenu();
  };

  const handleDeleteTab = (tabId) => {
    try {
      const del = useCompilerStore.getState().deleteTab;
      if (del) del(tabId);
    } catch (e) {}
    closeMenu();
  };

  const handleSelectTab = (tabId) => {
    try {
      const sel = useCompilerStore.getState().selectTab;
      if (sel) sel(tabId);
    } catch (e) {}
    closeMenu();
  };

  const handleAddTab = () => {
    try {
      const add = useCompilerStore.getState().addTab;
      if (add) add();
    } catch (e) {}
    closeMenu();
  };

  const handleCloseTab = (tabId) => {
    try {
      const closeT = useCompilerStore.getState().closeTab;
      if (closeT) closeT(tabId);
    } catch (e) {}
    if (openMenuTabId === tabId) {
      closeMenu();
    }
  };

  const handleRenameTab = (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) {
      closeMenu();
      return;
    }
    const userInput = window.prompt("Rename file", tab.name);
    if (userInput === null) {
      closeMenu();
      return;
    }
    const trimmed = userInput.trim();
    if (!trimmed || trimmed === tab.name) {
      closeMenu();
      return;
    }
    try {
      const rn = useCompilerStore.getState().renameTab;
      if (rn) rn(tabId, trimmed);
    } catch (e) {}
    closeMenu();
  };

  const activeMenuTab = useMemo(() => {
    return (tabs || []).find((tab) => tab.id === openMenuTabId) ?? null;
  }, [tabs, openMenuTabId]);

  useEffect(() => {
    if (!openMenuTabId) {
      return;
    }

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

  const handleAIRequest = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      const response = await getAISuggestions(prompt);
      setSource(response.suggestions);
      setIsModalOpen(false);
      setPrompt("");
    } catch (err) {
      console.error("AI Request failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="text-sm text-white/80 mb-2 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-wide">Editor</span>
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

      {/* VS Code style tab bar */}
        <div className="mb-2 flex items-center gap-2">
        <div 
          ref={tabsContainerRef}
          className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-nowrap scroll-smooth"
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
                  className={`group inline-flex items-center rounded-t-lg border px-4 py-2 shadow-inner transition-colors ${
                    isActive
                      ? "border-white/10 border-b-0 bg-black/60 text-cyan-100"
                      : "border-transparent bg-black/30 text-white/60 hover:border-white/10 hover:bg-black/50 hover:text-cyan-100"
                  }`}
                >
                  <span className="text-sm font-medium tracking-wide whitespace-nowrap">{tab.name}</span>
                  <button
                    type="button"
                    className={`ml-3 flex h-6 w-6 items-center justify-center rounded text-white/40 transition ${
                      menuOpen
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
                  className={`w-full rounded px-3 py-2 text-left text-sm transition ${
                    tabs.length > 1
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
                  className={`w-full rounded px-3 py-2 text-left text-sm transition ${
                    tabs.length > 1
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
          <div className="flex-1 overflow-hidden rounded-xl border border-white/10 shadow-2xl">
            <Editor
              value={source}
              onMount={(editor, monacoInstance) => {
                // register instances in store for actions like revealPosition
                registerEditor(editor, monacoInstance);
              }}
              onChange={(v) => {
                setSource(v ?? "");
                // update current active tab content
                try {
                  const st = useCompilerStore.getState();
                  if (st && st.activeTabId) {
                    st.updateTabContent(st.activeTabId, v ?? "");
                  }
                } catch (e) {}
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
        <PanelResizeHandle className="h-2 my-2 rounded bg-white/5 transition-colors hover:bg-white/10" />
        <Panel defaultSize={35} minSize={15} className="flex">
          <div className="flex-1 rounded-xl border border-white/10 bg-gray-900/60 shadow-lg">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
                Problem Statement
              </h2>
            </div>
            <div className="p-4">
              <textarea
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                placeholder="Document the challenge, constraints, and expected behavior here..."
                className="h-28 w-full resize-none rounded-lg border border-cyan-500/20 bg-gray-800/80 p-3 font-mono text-sm text-cyan-100 placeholder:text-cyan-100/40 outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 transition-all duration-200"
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Futuristic Toolkit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-20">
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
              className="relative w-80 rounded-xl border border-cyan-500/30 bg-gray-900/95 backdrop-blur-xl shadow-2xl"
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
