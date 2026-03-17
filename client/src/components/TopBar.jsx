import React, { useState, useRef, useEffect } from "react";
import { useCompilerStore } from "../store/useCompilerStore";
import { motion } from "framer-motion";
import RunButtons from "./RunButtons";
import { LANGUAGES } from "../lib/languageMap";
import { Code2, PanelLeft } from "lucide-react";

export default function TopBar({ onToggleExplorer }) {
  const { languageId, setLanguageId, theme, setTheme, setSource, currentUser, tabs, selectTab, goToMatch, setSearchQuery: setStoreSearchQuery } =
    useCompilerStore();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [scope, setScope] = useState("files"); // files | code
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef(null);
  const userInitials = currentUser?.name
    ? currentUser.name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || currentUser.name.slice(0, 2).toUpperCase()
    : "";

  const helloWorldCodes = {
    45: `section .text
global _start
_start:
    mov r0, 1
    mov r1, msg
    mov r2, 13
    mov r7, 4
    svc 0
    mov r7, 1
    svc 0
msg: db 'Hello World', 10`,
    46: `echo "Hello World"`,
    47: `PRINT "Hello World"`,
    104: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    110: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    75: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    76: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`,
    103: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    105: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`,
    48: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    52: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`,
    49: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    53: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`,
    50: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    54: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`,
    86: `(def main):
  print("Hello World")`,
    51: `using System;
class Program {
  static void Main() {
    Console.WriteLine("Hello World");
  }
}`,
    77: `DISPLAY "Hello World"`,
    55: `(def main):
  (print "Hello World")`,
    90: `void main() {
    print("Hello World");
}`,
    56: `import std.stdio;
void main() {
    writeln("Hello World");
}`,
    57: `IO.puts("Hello World")`,
    58: `io:format("Hello World~n").`,
    44: `echo "Hello World"`,
    87: `open System
printfn "Hello World"`,
    59: `program HelloWorld;
begin
  writeln('Hello World');
end.`,
    60: `fmt.Println("Hello World")`,
    95: `fmt.Println("Hello World")`,
    106: `fmt.Println("Hello World")`,
    107: `fmt.Println("Hello World")`,
    88: `println "Hello World"`,
    61: `main = putStrLn "Hello World"`,
    96: `System.out.println("Hello World");`,
    91: `System.out.println("Hello World");`,
    62: `System.out.println("Hello World");`,
    63: `console.log("Hello World")`,
    93: `console.log("Hello World")`,
    97: `console.log("Hello World")`,
    102: `console.log("Hello World")`,
    78: `fun main() {
    println("Hello World")
}`,
    111: `fun main() {
    println("Hello World")
}`,
    64: `print("Hello World")`,
    89: `// Multi-file Hello World`,
    79: `#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`,
    65: `let greeting = "Hello World"; println(greeting)`,
    66: `disp('Hello World')`,
    67: `begin
  writeln('Hello World');
end.`,
  };


  const handleLanguageChange = (e) => {
    const newLanguageId = Number(e.target.value);
    // Only change the selected language here. Tab creation and source population
    // are handled by the EditorPanel/store to avoid conflicting rapid updates.
    setLanguageId(newLanguageId);
  };

  // Search helpers (scope-aware)
  const searchDebounceRef = React.useRef(null);
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSuggestions((prev) => (prev.length ? [] : prev));
        setIsOpen((prev) => (prev ? false : prev));
        setActiveIndex((prev) => (prev !== -1 ? -1 : prev));
        return;
      }
      const q = trimmed.toLowerCase();
      if (scope === "files") {
        const files = (tabs || []).filter((t) => t.name.toLowerCase().includes(q)).slice(0, 12);
        const newSuggestions = files.map((f) => ({ type: "file", item: f }));
        setSuggestions((prev) => {
          const same = prev.length === newSuggestions.length && prev.every((p, i) => p.item.id === newSuggestions[i].item.id);
          return same ? prev : newSuggestions;
        });
        setIsOpen(newSuggestions.length > 0);
        setActiveIndex(newSuggestions.length > 0 ? 0 : -1);
      } else if (scope === "code") {
        const results = [];
        const limit = 12;
        for (const t of tabs || []) {
          const content = (t.content || "").toLowerCase();
          let from = 0;
          while (results.length < limit) {
            const found = content.indexOf(q, from);
            if (found === -1) break;
            const before = (t.content || "").slice(0, found);
            const lineNumber = before.split("\n").length;
            const snippet = (t.content || "").split("\n")[lineNumber - 1] || "";
            results.push({ tab: t, lineNumber, snippet });
            from = found + q.length;
          }
          if (results.length >= limit) break;
        }
        const newSuggestions = results.map((r) => ({ type: "code", item: r }));
        setSuggestions((prev) => {
          const same = prev.length === newSuggestions.length && prev.every((p, i) => {
            const a = p.type === newSuggestions[i].type && (p.item.tab?.id || p.item.item?.id || p.item.id) === (newSuggestions[i].item.tab?.id || newSuggestions[i].item.item?.id || newSuggestions[i].item.id);
            return a;
          });
          return same ? prev : newSuggestions;
        });
        setIsOpen(newSuggestions.length > 0);
        setActiveIndex(newSuggestions.length > 0 ? 0 : -1);
      }
    }, 120);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query, scope, tabs]);

  const chooseSuggestion = (entry) => {
    if (!entry) return;
    if (entry.type === "file") {
      const f = entry.item;
      if (selectTab) selectTab(f.id);
    } else if (entry.type === "code") {
      const r = entry.item;
      if (goToMatch) goToMatch(r.tab.id, r.lineNumber, 1);
    }
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    try { setStoreSearchQuery(""); } catch { }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[activeIndex];
      if (pick) chooseSuggestion(pick);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    const onDocClick = (ev) => {
      if (searchRef.current && !searchRef.current.contains(ev.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="sticky top-0 z-50 px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap lg:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onToggleExplorer}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 lg:hidden"
              aria-label="Toggle file explorer"
            >
              <PanelLeft size={18} />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120 }}
              className="rounded-xl bg-white/10 p-2"
            >
              <Code2 className="text-indigo-300" size={24} />
            </motion.div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide text-white sm:text-base lg:text-lg">
                Online Code Compiler
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:gap-3 lg:w-auto lg:flex-nowrap">
            {/* user area intentionally hidden (no guest message, no name/email/logo) */}
            <div className="hidden sm:block" aria-hidden="true" />

            <div className="relative w-full min-w-0 sm:w-auto" ref={searchRef}>
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="bg-transparent text-white/80 outline-none relative z-50"
                    aria-label="Search scope"
                  >
                    <option value="files" style={{ color: '#000' }}>Files</option>
                    <option value="code" style={{ color: '#000' }}>Code</option>
                  </select>
                </div>
                <input
                  aria-label="Search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    try { setStoreSearchQuery(e.target.value); } catch { }
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsOpen(suggestions.length > 0)}
                  placeholder={scope === "files" ? "Search open files..." : "Search code in open files..."}
                  className="hidden md:block w-full max-w-xs rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus:border-cyan-400/60 lg:w-72"
                />
              </div>
              {isOpen && (
                <ul className="absolute right-0 z-50 mt-2 max-h-60 w-[min(92vw,24rem)] overflow-auto rounded-lg border border-white/10 bg-black/90 shadow-2xl">
                  {suggestions.map((s, idx) => {
                    if (s.type === "language") {
                      const item = s.item;
                      return (
                        <li
                          key={`lang-${item.id}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => chooseSuggestion(s)}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${idx === activeIndex ? "bg-white/5 text-cyan-200" : "text-white/70"
                            }`}
                        >
                          {item.label}
                        </li>
                      );
                    }
                    if (s.type === "file") {
                      const f = s.item;
                      return (
                        <li
                          key={`file-${f.id}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => chooseSuggestion(s)}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${idx === activeIndex ? "bg-white/5 text-cyan-200" : "text-white/70"
                            }`}
                        >
                          <div className="font-semibold">{f.name}</div>
                          <div className="text-xs text-white/50">Open file</div>
                        </li>
                      );
                    }
                    if (s.type === "code") {
                      const r = s.item;
                      return (
                        <li
                          key={`code-${idx}-${r.lineNumber}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => chooseSuggestion(s)}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${idx === activeIndex ? "bg-white/5 text-cyan-200" : "text-white/70"
                            }`}
                        >
                          <div className="font-semibold">{r.tab.name} — line {r.lineNumber}</div>
                          <div className="text-xs text-white/50 font-mono truncate">{r.snippet.trim()}</div>
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              )}
            </div>

            {/* Timer moved to InputPanel */}

            <select
              className="ui-control w-32 bg-black/35 sm:w-40"
              value={languageId}
              onChange={handleLanguageChange}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id} style={{ color: '#000' }}>
                  {l.label}
                </option>
              ))}
            </select>

            {/* Theme selector removed from TopBar (settings still control themes) */}

            <RunButtons />
          </div>
        </div>
      </div>
    </div>
  );
}
