import { create } from "zustand";
import { getMonacoLanguage, getDefaultFileNameForMonaco } from "../lib/languageUtils";
import { explainError as apiExplainError } from "../services/api";

// Simple heuristic fallback for common error messages across languages.
function explainFallback(stderr, compile_output, languageId) {
  const text = `${stderr || ''}\n${compile_output || ''}`.toLowerCase();
  // Common JavaScript runtime errors
  if (text.includes('referenceerror') || text.includes('is not defined')) {
    return 'ReferenceError: A variable or function is used before it is defined. Check for typos, missing imports, or scope issues.';
  }
  if (text.includes('syntaxerror') || text.includes('unexpected token')) {
    return 'SyntaxError: There is likely a missing or extra token in your code (bracket, parenthesis, comma). Check the nearby line for syntax issues.';
  }
  if (text.includes('typeerror')) {
    return 'TypeError: An operation was performed on a value of the wrong type (e.g., calling a non-function). Inspect the value that caused the error.';
  }
  // Common Python hints
  if (text.includes('indentationerror') || text.includes('expected an indented block')) {
    return 'IndentationError: Python expects consistent indentation. Make sure spaces/tabs are consistent and blocks are indented properly.';
  }
  if (text.includes('nameerror') && text.includes('name')) {
    return 'NameError: A variable or function name is not defined in scope. Check for typos or missing declarations.';
  }
  // Compilation errors (C/C++/Java)
  if (text.includes('error:') || text.includes('undefined reference')) {
    return 'Compilation error: Check the compiler output for missing symbols, mismatched types, or missing headers. See the compile output above for details.';
  }
  // Fallback generic hint
  return 'No specific heuristic was matched. Inspect the stderr and compile output above. If available, enable AI suggestions on the server for richer explanations.';
}

const CURRENT_SESSION_STORAGE_KEY = "esm-compiler-session";

const loadStoredSession = () => {
  if (typeof window === "undefined") {
    return { user: null, token: null };
  }
  try {
    const raw = window.localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
    if (!raw) {
      return { user: null, token: null };
    }
    const parsed = JSON.parse(raw);
    return {
      user: parsed?.user ?? null,
      token: parsed?.token ?? null,
    };
  } catch {
    return { user: null, token: null };
  }
};

const persistSession = (session) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!session?.user && !session?.token) {
    window.localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(
      CURRENT_SESSION_STORAGE_KEY,
      JSON.stringify({
        user: session.user ?? null,
        token: session.token ?? null,
      })
    );
  } catch {
    // ignore persistence errors (private browsing, etc.)
  }
};

const storedSession = loadStoredSession();

/**
 * Global store for editor state, language, stdin, and run results.
 * Kept small & serializable to avoid re-renders in Monaco.
 */
export const useCompilerStore = create((set) => ({
  languageId: 63, // 63 = JavaScript (Node.js) in Judge0
  theme: "hc-black",
  source: `// Welcome to the 2050 Compiler 🌌
/* Try JS (language: JavaScript - Node.js) */
function solve() {
  const fs = require('fs');
  const input = fs.readFileSync(0, 'utf8').trim();
  console.log('Echo:', input || 'no stdin');
}
solve();`, // Default code
  stdin: "",
  isRunning: false,
  result: null, // { stdout, stderr, compile_output, status, memory, time, timeMs }
  // UI: which view is active in the output panel
  outputPanelView: "output",
  // last fetched explanation text and loading state
  explanation: null,
  explainLoading: false,
  editorFontSize: 14,
  showMinimap: false,
  wordWrap: "off",
  showLineNumbers: true,
  tabSize: 2,
  currentUser: storedSession.user,
  authToken: storedSession.token,

  // Tabs and editor integration (moved from EditorPanel into global store so other components can search/jump)
  tabs: (() => {
    try {
      const initialLangId = 63;
      const monacoLang = getMonacoLanguage(initialLangId);
      return [
        {
          id: "tab-1",
          name: getDefaultFileNameForMonaco(monacoLang),
          content: `// Welcome to the 2050 Compiler 🌌\n/* Try JS (language: JavaScript - Node.js) */\nfunction solve() {\n  const fs = require('fs');\n  const input = fs.readFileSync(0, 'utf8').trim();\n  console.log('Echo:', input || 'no stdin');\n}\nsolve();`,
          isCustomName: false,
          languageId: initialLangId,
        },
      ];
    } catch (e) {
      return [
        {
          id: "tab-1",
          name: "untitled.txt",
          content: "",
          isCustomName: false,
          languageId: 63,
        },
      ];
    }
  })(),
  activeTabId: "tab-1",
  nextTabCounter: 1,
  leaderboardTick: 0,
  runCount: 0,
  editorInstance: null,
  monacoInstance: null,
  // Run limit settings: runLimit = number or null for unlimited
  runLimit: null,
  dailyRunDate: (() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem('esm-run-daily');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.date ?? null;
    } catch {
      return null;
    }
  })(),
  dailyRunCount: (() => {
    try {
      if (typeof window === 'undefined') return 0;
      const raw = window.localStorage.getItem('esm-run-daily');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Number(parsed?.count ?? 0) || 0;
    } catch {
      return 0;
    }
  })(),

  // export behavior: whether Export to Zip should include all open tabs
  exportAllFiles: (() => {
    try {
      if (typeof window === 'undefined') return false;
      const raw = window.localStorage.getItem('esm-export-all');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed?.exportAll;
    } catch {
      return false;
    }
  })(),

  setLanguageId: (id) => set({ languageId: id }),
  setTheme: (t) => set({ theme: t }),
  setSource: (s) => set({ source: s }),
  setStdin: (i) => set({ stdin: i }),
  setIsRunning: (v) => set({ isRunning: v }),
  setResult: (r) => set({ result: r }),
  setOutputPanelView: (v) => set({ outputPanelView: v }),
  setExplanation: (txt) => set({ explanation: txt }),
  setExplainLoading: (b) => set({ explainLoading: b }),
  // Fetch explanation for current result using AI endpoint; safe no-op if no errors
  explainCurrentError: async () => {
    try {
      const state = useCompilerStore.getState();
      const res = state.result || {};
      const stderr = res.stderr || res.stderr_raw || "";
      const compile_output = res.compile_output || "";
      if (!String(stderr).trim() && !String(compile_output).trim()) {
        set({ explanation: "No stderr or compile output to explain." });
        return;
      }
      set({ explainLoading: true, explanation: null });
      try {
        const resp = await apiExplainError({ language: state.languageId, stderr: String(stderr), compile_output: String(compile_output), context: res.stdout || "" });
        const suggested = resp?.suggestions;
        if (suggested && String(suggested).trim()) {
          set({ explanation: suggested });
        } else {
          // fallback to heuristic hints
          const hint = explainFallback(String(stderr), String(compile_output), state.languageId);
          set({ explanation: hint });
        }
      } catch (err) {
        // API failed — produce a heuristic explanation instead of failing silently
        const hint = explainFallback(String(stderr), String(compile_output), state.languageId);
        set({ explanation: `${String(err?.message || err || "AI request failed")}
\n\nFallback hint:\n${hint}` });
      }
    } catch (e) {
      // ignore
    } finally {
      set({ explainLoading: false });
    }
  },
  setEditorFontSize: (size) => set({ editorFontSize: size }),
  setShowMinimap: (value) => set({ showMinimap: value }),
  setWordWrap: (mode) => set({ wordWrap: mode }),
  setShowLineNumbers: (value) => set({ showLineNumbers: value }),
  setTabSize: (size) => set({ tabSize: size }),
  setRunLimit: (limit) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('esm-run-limit', JSON.stringify({ limit }));
      }
    } catch {}
    set({ runLimit: limit });
  },
  setExportAllFiles: (val) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('esm-export-all', JSON.stringify({ exportAll: !!val }));
      }
    } catch {}
    set({ exportAllFiles: !!val });
  },
  // check and reset daily counter if date changed
  _ensureDaily: () => {
    try {
      const today = new Date().toISOString().slice(0,10);
      const state = useCompilerStore.getState();
      if (state.dailyRunDate !== today) {
        // reset
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('esm-run-daily', JSON.stringify({ date: today, count: 0 }));
          } catch {}
        }
        set({ dailyRunDate: today, dailyRunCount: 0 });
      }
    } catch {}
  },
  canRun: () => {
    try {
      const state = useCompilerStore.getState();
      state._ensureDaily();
      if (state.runLimit == null) return true;
      return (state.dailyRunCount || 0) < state.runLimit;
    } catch (e) {
      return true;
    }
  },
  recordRun: () => {
    try {
      const today = new Date().toISOString().slice(0,10);
      const state = useCompilerStore.getState();
      if (state.dailyRunDate !== today) {
        state._ensureDaily();
      }
      const nextCount = (state.dailyRunCount || 0) + 1;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('esm-run-daily', JSON.stringify({ date: today, count: nextCount }));
        } catch {}
      }
      // update runCount and leaderboardTick too
      set({ dailyRunDate: today, dailyRunCount: nextCount, runCount: (state.runCount || 0) + 1, leaderboardTick: (state.leaderboardTick || 0) + 1 });
    } catch (e) {}
  },
  setAuthSession: ({ user, token }) => {
    persistSession({ user, token });
    set({ currentUser: user ?? null, authToken: token ?? null });
  },
  logout: () => {
    persistSession({ user: null, token: null });
    set({ currentUser: null, authToken: null });
  },

  clearIO: () => set({ stdin: "", result: null }),

  // Tab & editor actions
  registerEditor: (editor, monaco) => set({ editorInstance: editor, monacoInstance: monaco }),
  addTab: () =>
    set((state) => {
      const next = state.nextTabCounter + 1;
      const monacoLang = getMonacoLanguage(state.languageId);
      const baseName = getDefaultFileNameForMonaco(monacoLang);
      const name = next === 1 ? baseName : baseName.replace(/(\.[^.]+)?$/, (m) => (m ? `_${next}${m}` : `_${next}`));
      const newTab = { id: `tab-${next}`, name, content: "", isCustomName: false, languageId: state.languageId };
      return { tabs: [...state.tabs, newTab], activeTabId: newTab.id, nextTabCounter: next, source: "" , languageId: state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  createTab: ({ name, content = "", isCustomName = false }) =>
    set((state) => {
      const next = state.nextTabCounter + 1;
      const safeName = name || getDefaultFileNameForMonaco(getMonacoLanguage(state.languageId));
      const newTab = { id: `tab-${next}`, name: safeName, content: content ?? "", isCustomName, languageId: state.languageId };
      return { tabs: [...state.tabs, newTab], activeTabId: newTab.id, nextTabCounter: next, source: content ?? "", languageId: state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  selectTab: (tabId) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId) || state.tabs[0];
      // when selecting a tab, also update global language to match the tab's languageId
      const nextLang = tab.languageId ?? state.languageId;
      return { activeTabId: tab.id, source: tab.content, languageId: nextLang };
    }),
  updateTabContent: (tabId, content) =>
    set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, content } : t)) })),
  renameTab: (tabId, newName) =>
    set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, name: newName, isCustomName: true } : t)) })),
  duplicateTab: (tabId) =>
    set((state) => {
      const original = state.tabs.find((t) => t.id === tabId);
      if (!original) return {};
      const next = state.nextTabCounter + 1;
      const safeBase = (original.name || "untitled").replace(/ Copy( \d+)?(\.[^.]+)?$/, "");
      let candidate = `${safeBase} Copy`;
      const taken = new Set(state.tabs.map((t) => t.name));
      let counter = 1;
      while (taken.has(candidate)) {
        counter += 1;
        candidate = `${safeBase} Copy ${counter}`;
      }
      const duplicated = { id: `tab-${next}`, name: candidate, content: original.content, isCustomName: true, languageId: original.languageId ?? state.languageId };
      return { tabs: [...state.tabs, duplicated], activeTabId: duplicated.id, nextTabCounter: next, source: duplicated.content, languageId: duplicated.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  closeTab: (tabId) =>
    set((state) => {
      if (state.tabs.length === 1) return state;
      const index = state.tabs.findIndex((t) => t.id === tabId);
      if (index === -1) return state;
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      let nextActive = state.activeTabId;
      if (tabId === state.activeTabId) {
        const fallback = nextTabs[Math.max(index - 1, 0)];
        nextActive = fallback.id;
      }
      const activeTab = nextTabs.find((t) => t.id === nextActive) || nextTabs[0];
      return { tabs: nextTabs, activeTabId: nextActive, source: activeTab.content, languageId: activeTab.languageId ?? state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  closeOthers: (tabId) =>
    set((state) => {
      const target = state.tabs.find((t) => t.id === tabId) || state.tabs[0];
      return { tabs: [target], activeTabId: target.id, source: target.content, languageId: target.languageId ?? state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  closeAll: () =>
    set((state) => {
      const monacoLang = getMonacoLanguage(state.languageId);
      const baseName = getDefaultFileNameForMonaco(monacoLang);
      const baseTab = { id: "tab-1", name: baseName, content: "", isCustomName: false, languageId: state.languageId };
      return { tabs: [baseTab], activeTabId: baseTab.id, nextTabCounter: 1, source: "", languageId: state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  deleteTab: (tabId) =>
    set((state) => {
      if (state.tabs.length === 1 && state.tabs[0].id === tabId) {
        const monacoLang = getMonacoLanguage(state.languageId);
        const baseName = getDefaultFileNameForMonaco(monacoLang);
        const baseTab = { id: "tab-1", name: baseName, content: "", isCustomName: false, languageId: state.languageId };
        return { tabs: [baseTab], activeTabId: baseTab.id, nextTabCounter: 1, source: "", languageId: state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
      }
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      const index = state.tabs.findIndex((t) => t.id === tabId);
      let nextActive = state.activeTabId;
      if (tabId === state.activeTabId) {
        const fallback = nextTabs[Math.max(index - 1, 0)];
        nextActive = fallback.id;
      }
      const activeTab = nextTabs.find((t) => t.id === nextActive) || nextTabs[0];
      return { tabs: nextTabs, activeTabId: nextActive, source: activeTab.content, languageId: activeTab.languageId ?? state.languageId, leaderboardTick: (state.leaderboardTick || 0) + 1 };
    }),
  // bump this when an activity occurred that should refresh leaderboard views
  pokeLeaderboard: () => set((s) => ({ leaderboardTick: (s.leaderboardTick || 0) + 1 })),
  incrementRunCount: () => set((s) => ({ runCount: (s.runCount || 0) + 1, leaderboardTick: (s.leaderboardTick || 0) + 1 })),
  // Jump to a position inside a tab (selects tab then reveals in Monaco)
  goToMatch: async (tabId, lineNumber = 1, column = 1) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId) || state.tabs[0];
      // We'll set active and source synchronously; revealing is done after state update via timeout
      setTimeout(() => {
        const editor = state.editorInstance;
        if (editor && typeof editor.setPosition === "function") {
          try {
            editor.focus();
            editor.setPosition({ lineNumber, column });
            editor.revealPositionInCenter({ lineNumber, column });
          } catch (err) {
            // ignore
          }
        }
      }, 60);
      return { activeTabId: tab.id, source: tab.content };
    }),
}));
