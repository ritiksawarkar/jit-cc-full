import React, { useState, useRef, useEffect } from "react";
import { useCompilerStore } from "../store/useCompilerStore";
import { motion } from "framer-motion";
import RunButtons from "./RunButtons";
import { DEFAULT_LANGUAGE_ICON, LANGUAGES } from "../lib/languageMap";
import { Check, ChevronDown, Code2, PanelLeft } from "lucide-react";

export default function TopBar({ onToggleExplorer }) {
  const { languageId, setLanguageId, theme, setTheme, setSource, currentUser, tabs, selectTab, goToMatch, setSearchQuery: setStoreSearchQuery } =
    useCompilerStore();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [scope, setScope] = useState("files"); // files | code
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const searchRef = useRef(null);
  const languageRef = useRef(null);
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
  const selectedLanguage =
    LANGUAGES.find((lang) => lang.id === languageId) || LANGUAGES[0];

  const handleLanguageSelect = (newLanguageId) => {
    setLanguageId(Number(newLanguageId));
    setIsLanguageOpen(false);
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
      if (languageRef.current && !languageRef.current.contains(ev.target)) {
        setIsLanguageOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="sticky top-0 z-50 w-full max-w-full overflow-x-clip bg-gray-950 px-2 pt-2 sm:px-3 md:px-4">
      <div className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-black/60 via-black/40 to-black/60 px-2 py-2 shadow-lg backdrop-blur-lg sm:px-3 md:px-4 md:py-3">
        <div className="flex w-full flex-wrap items-center gap-2 xl:flex-nowrap xl:gap-3">
          {/* Left section: Logo and branding */}
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2.5 lg:gap-3">
            <button
              type="button"
              onClick={onToggleExplorer}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Toggle file explorer"
            >
              <PanelLeft size={18} />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120 }}
              className="rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 p-2"
            >
              <Code2 className="text-indigo-300" size={24} />
            </motion.div>
            <div className="flex min-w-0 flex-col justify-center leading-tight">
              <div className="truncate text-sm font-bold tracking-wide text-white sm:text-base lg:text-lg">
                JIT Compiler
              </div>
              <div className="mt-0.5 hidden text-xs text-white/60 sm:block">Online IDE</div>
            </div>
          </div>

          {/* Right section: Search, Language, Run buttons */}
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2 md:flex-nowrap xl:ml-auto xl:w-auto xl:flex-nowrap xl:gap-3">
            {/* Search box - hidden on small screens */}
            <div className="relative hidden min-w-0 md:block md:flex-1 md:min-w-[180px] md:max-w-[340px] lg:max-w-[400px]" ref={searchRef}>
              <div className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 transition-colors focus-within:border-cyan-500/50 focus-within:bg-white/10">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="h-full shrink-0 bg-transparent text-xs font-semibold leading-none text-white/70 outline-none"
                  aria-label="Search scope"
                >
                  <option value="files" style={{ color: "#000" }}>
                    Files
                  </option>
                  <option value="code" style={{ color: "#000" }}>
                    Code
                  </option>
                </select>
                <span className="h-4 w-px bg-white/20" />
                <input
                  aria-label="Search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    try {
                      setStoreSearchQuery(e.target.value);
                    } catch { }
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsOpen(suggestions.length > 0)}
                  placeholder={
                    scope === "files" ? "Search files..." : "Search code..."
                  }
                  className="h-full min-w-0 flex-1 bg-transparent text-sm leading-none text-white outline-none placeholder:text-white/50"
                />
              </div>
              {isOpen && (
                <ul className="absolute right-0 z-50 mt-2 max-h-64 w-[min(92vw,28rem)] overflow-auto rounded-lg border border-white/10 bg-black/95 shadow-2xl">
                  {suggestions.map((s, idx) => {
                    if (s.type === "language") {
                      const item = s.item;
                      return (
                        <li
                          key={`lang-${item.id}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => chooseSuggestion(s)}
                          className={`px-4 py-2 text-sm cursor-pointer transition-colors ${idx === activeIndex
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "text-white/70 hover:bg-white/5"
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
                          className={`px-4 py-2 text-sm cursor-pointer transition-colors ${idx === activeIndex
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "text-white/70 hover:bg-white/5"
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
                          className={`px-4 py-2 text-sm cursor-pointer transition-colors ${idx === activeIndex
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "text-white/70 hover:bg-white/5"
                            }`}
                        >
                          <div className="font-semibold">
                            {r.tab.name} — line {r.lineNumber}
                          </div>
                          <div className="text-xs text-white/50 font-mono truncate">
                            {r.snippet.trim()}
                          </div>
                        </li>
                      );
                    }
                    return null;
                  })}
                </ul>
              )}
            </div>

            {/* Language selector */}
            <div className="relative w-full max-w-[220px] shrink-0 sm:max-w-[250px] md:w-[220px] lg:w-[240px] xl:w-[280px]" ref={languageRef}>
              <button
                type="button"
                onClick={() => setIsLanguageOpen((prev) => !prev)}
                className="ui-control h-10 flex w-full items-center justify-between gap-2 bg-black/35 py-0 text-left hover:bg-black/50 transition-colors"
                aria-haspopup="listbox"
                aria-expanded={isLanguageOpen}
                aria-label="Select language and version"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <img
                    src={selectedLanguage?.icon || DEFAULT_LANGUAGE_ICON}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-sm"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_LANGUAGE_ICON;
                    }}
                  />
                  <span className="truncate text-left text-sm font-medium leading-none">
                    {selectedLanguage?.label}
                  </span>
                </span>
                <ChevronDown
                  size={15}
                  className={`shrink-0 transition-transform ${isLanguageOpen ? "rotate-180" : ""
                    }`}
                />
              </button>

              {isLanguageOpen && (
                <ul
                  className="absolute right-0 z-50 mt-2 max-h-72 w-[min(92vw,28rem)] overflow-auto rounded-lg border border-white/10 bg-black/95 p-2 shadow-2xl"
                  role="listbox"
                  aria-label="Languages"
                >
                  {LANGUAGES.map((language) => (
                    <li key={language.id} role="option" aria-selected={language.id === languageId}>
                      <button
                        type="button"
                        onClick={() => handleLanguageSelect(language.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${language.id === languageId
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "text-white/70 hover:bg-white/10"
                          }`}
                      >
                        <img
                          src={language.icon || DEFAULT_LANGUAGE_ICON}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_LANGUAGE_ICON;
                          }}
                        />
                        <span className="flex-1 truncate">{language.label}</span>
                        {language.id === languageId ? (
                          <Check size={14} className="shrink-0" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Run buttons (includes notification badge) */}
            <RunButtons />
          </div>
        </div>
      </div>
    </div>
  );
}
