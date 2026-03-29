/**
 * Common languages; keys are Judge0 IDs.
 * Add more as you like from /languages endpoint.
 */
// languageMap.js
const RAW_LANGUAGES = [
  { id: 45, label: "Assembly (NASM 2.14.02)" },
  { id: 46, label: "Bash (5.0.0)" },
  { id: 47, label: "Basic (FBC 1.07.1)" },
  { id: 104, label: "C (Clang 18.1.8)" },
  { id: 110, label: "C (Clang 19.1.7)" },
  { id: 75, label: "C (Clang 7.0.1)" },
  { id: 76, label: "C++ (Clang 7.0.1)" },
  { id: 103, label: "C (GCC 14.1.0)" },
  { id: 105, label: "C++ (GCC 14.1.0)" },
  { id: 48, label: "C (GCC 7.4.0)" },
  { id: 52, label: "C++ (GCC 7.4.0)" },
  { id: 49, label: "C (GCC 8.3.0)" },
  { id: 53, label: "C++ (GCC 8.3.0)" },
  { id: 50, label: "C (GCC 9.2.0)" },
  { id: 54, label: "C++ (GCC 9.2.0)" },
  { id: 86, label: "Clojure (1.10.1)" },
  { id: 51, label: "C# (.NET Core SDK 3.1.202)" },
  { id: 77, label: "COBOL (GnuCOBOL 2.2)" },
  { id: 55, label: "Common Lisp (SBCL 2.0.0)" },
  { id: 90, label: "Dart (2.19.2)" },
  { id: 56, label: "D (DMD 2.089.1)" },
  { id: 57, label: "Elixir (1.9.4)" },
  { id: 58, label: "Erlang (OTP 22.2)" },
  { id: 44, label: "Executable" },
  { id: 87, label: "F# (.NET Core SDK 3.1.202)" },
  { id: 59, label: "Fortran (GFortran 9.2.0)" },
  { id: 60, label: "Go (1.13.5)" },
  { id: 95, label: "Go (1.18.5)" },
  { id: 106, label: "Go (1.22.0)" },
  { id: 107, label: "Go (1.23.5)" },
  { id: 88, label: "Groovy (3.0.3)" },
  { id: 61, label: "Haskell (GHC 8.8.1)" },
  { id: 96, label: "JavaFX (JDK 17.0.6, OpenJFX 22.0.2)" },
  { id: 91, label: "Java (JDK 17.0.6)" },
  { id: 62, label: "Java (OpenJDK 13.0.1)" },
  { id: 63, label: "JavaScript (Node.js 12.14.0)" },
  { id: 93, label: "JavaScript (Node.js 18.15.0)" },
  { id: 97, label: "JavaScript (Node.js 20.17.0)" },
  { id: 102, label: "JavaScript (Node.js 22.08.0)" },
  { id: 78, label: "Kotlin (1.3.70)" },
  { id: 111, label: "Kotlin (2.1.10)" },
  { id: 64, label: "Lua (5.3.5)" },
  { id: 89, label: "Multi-file program" },
  { id: 79, label: "Objective-C (Clang 7.0.1)" },
  { id: 65, label: "OCaml (4.09.0)" },
  { id: 66, label: "Octave (5.1.0)" },
  { id: 67, label: "Pascal (FPC 3.0.4)" },
  { id: 85, label: "Perl (5.28.1)" },
  { id: 68, label: "PHP (7.4.1)" },
  { id: 98, label: "PHP (8.3.11)" },
  { id: 43, label: "Plain Text" },
  { id: 69, label: "Prolog (GNU Prolog 1.4.5)" },
  { id: 70, label: "Python (2.7.17)" },
  { id: 92, label: "Python (3.11.2)" },
  { id: 100, label: "Python (3.12.5)" },
  { id: 109, label: "Python (3.13.2)" },
  { id: 71, label: "Python (3.8.1)" },
  { id: 80, label: "R (4.0.0)" },
  { id: 99, label: "R (4.4.1)" },
  { id: 72, label: "Ruby (2.7.0)" },
  { id: 73, label: "Rust (1.40.0)" },
  { id: 108, label: "Rust (1.85.0)" },
  { id: 81, label: "Scala (2.13.2)" },
  { id: 112, label: "Scala (3.4.2)" },
  { id: 82, label: "SQL (SQLite 3.27.2)" },
  { id: 83, label: "Swift (5.2.3)" },
  { id: 74, label: "TypeScript (3.7.4)" },
  { id: 94, label: "TypeScript (5.0.3)" },
  { id: 101, label: "TypeScript (5.6.2)" },
  { id: 84, label: "Visual Basic.Net (vbnc 0.0.0.5943)" },
];

export const DEFAULT_LANGUAGE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%2311162a'/%3E%3Cpath d='M18 17h10l10 15 8-11h10L42 40l8 12H40L30 37l-8 11H12l13-18-7-13z' fill='%23dbe4ff'/%3E%3C/svg%3E";

const LANGUAGE_ICON_BY_KEYWORD = {
  assembly: "https://cdn.simpleicons.org/assemblyscript",
  bash: "https://cdn.simpleicons.org/gnubash",
  basic: "https://cdn.simpleicons.org/freebasic",
  c: "https://cdn.simpleicons.org/c",
  "c++": "https://cdn.simpleicons.org/cplusplus",
  clojure: "https://cdn.simpleicons.org/clojure",
  "c#": "https://cdn.simpleicons.org/csharp",
  cobol: "https://cdn.simpleicons.org/cobol",
  "common lisp": "https://cdn.simpleicons.org/commonlisp",
  dart: "https://cdn.simpleicons.org/dart",
  d: "https://cdn.simpleicons.org/d",
  elixir: "https://cdn.simpleicons.org/elixir",
  erlang: "https://cdn.simpleicons.org/erlang",
  executable: "https://cdn.simpleicons.org/linux",
  "f#": "https://cdn.simpleicons.org/fsharp",
  fortran: "https://cdn.simpleicons.org/fortran",
  go: "https://cdn.simpleicons.org/go",
  groovy: "https://cdn.simpleicons.org/groovy",
  haskell: "https://cdn.simpleicons.org/haskell",
  javafx: "https://cdn.simpleicons.org/openjdk",
  java: "https://cdn.simpleicons.org/openjdk",
  javascript: "https://cdn.simpleicons.org/javascript",
  kotlin: "https://cdn.simpleicons.org/kotlin",
  lua: "https://cdn.simpleicons.org/lua",
  "multi-file program": "https://cdn.simpleicons.org/files",
  "objective-c": "https://cdn.simpleicons.org/objectivec",
  ocaml: "https://cdn.simpleicons.org/ocaml",
  octave: "https://cdn.simpleicons.org/gnuoctave",
  pascal: "https://cdn.simpleicons.org/pascal",
  perl: "https://cdn.simpleicons.org/perl",
  php: "https://cdn.simpleicons.org/php",
  "plain text": "https://cdn.simpleicons.org/readthedocs",
  prolog: "https://cdn.simpleicons.org/prolog",
  python: "https://cdn.simpleicons.org/python",
  r: "https://cdn.simpleicons.org/r",
  ruby: "https://cdn.simpleicons.org/ruby",
  rust: "https://cdn.simpleicons.org/rust",
  scala: "https://cdn.simpleicons.org/scala",
  sql: "https://cdn.simpleicons.org/sqlite",
  swift: "https://cdn.simpleicons.org/swift",
  typescript: "https://cdn.simpleicons.org/typescript",
  "visual basic.net": "https://cdn.simpleicons.org/visualbasic",
};

function getLanguageKeyword(label) {
  if (!label) return "";
  const base = String(label).split("(")[0].trim().toLowerCase();
  if (base.startsWith("c++")) return "c++";
  if (base.startsWith("c#")) return "c#";
  if (base === "d") return "d";
  if (base === "r") return "r";
  return base;
}

export const LANGUAGES = RAW_LANGUAGES.map((language) => {
  const keyword = getLanguageKeyword(language.label);
  return {
    ...language,
    icon: LANGUAGE_ICON_BY_KEYWORD[keyword] || DEFAULT_LANGUAGE_ICON,
  };
});

export const THEMES = [
  { id: "vs-dark", label: "VS Dark" },
  { id: "hc-black", label: "High Contrast" },
  { id: "light", label: "Light" },
];
