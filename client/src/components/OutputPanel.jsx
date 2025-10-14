import React, { useEffect, useState } from "react";
import { useCompilerStore } from "../store/useCompilerStore";
import Shimmer from "./Shimmer";
import { typeOut } from "../lib/typing";
import { motion, AnimatePresence } from "framer-motion";
import { explainError } from "../services/api";

function normalize(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function OutputPanel() {
  const { isRunning, result, outputPanelView, explanation, explainLoading, setOutputPanelView, explainCurrentError } = useCompilerStore();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function runTyping() {
      setTyped("");
      if (!result) return;

      const parts = [];
      const out = normalize(result.stdout);
      const err = normalize(result.stderr);
      const comp = normalize(result.compile_output);

      if (out.trim()) parts.push(out.trim());
      if (err.trim()) parts.push(`[stderr]\n${err.trim()}`);
      if (comp.trim()) parts.push(`[compile]\n${comp.trim()}`);
      if (!parts.length) parts.push("(no output)");

      const full = parts.join("\n\n");
      for await (const s of typeOut(full, 6)) {
        if (cancelled) break;
        setTyped(s);
      }
    }

    runTyping();
    return () => {
      cancelled = true;
    };
  }, [result]);

  useEffect(() => {
    // when a new result arrives, reset the explanation view
    // (store-managed explanation will be cleared by explainCurrentError)
  }, [result]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOutputPanelView("output")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition ${
              outputPanelView === "output" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/3"
            }`}
          >
            Output
          </button>
          <button
            type="button"
            onClick={() => setOutputPanelView("explain")}
            className={`px-3 py-1 rounded-md text-sm font-medium transition ${
              outputPanelView === "explain" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/3"
            }`}
          >
            Error Explanation
          </button>
        </div>
        <div className="text-xs text-white/50">
          {result?.status?.description ? `Status: ${result.status.description}` : ""}
          {result?.time ? ` • Time: ${result.time}s` : ""}
          {result?.memory ? ` • Memory: ${result.memory} KB` : ""}
          {result?.timeMs ? ` • RTT: ${result.timeMs} ms` : ""}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl p-3 font-mono text-sm bg-black/50 border border-white/10">
  {outputPanelView === "output" ? (
          <AnimatePresence mode="wait">
            {isRunning ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <Shimmer lines={10} />
                <div className="mt-3 text-xs text-white/50">Compiling ....</div>
              </motion.div>
            ) : (
              <motion.pre
                key="output"
                className="whitespace-pre-wrap typing-caret text-white"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {typed}
              </motion.pre>
            )}
          </AnimatePresence>
        ) : (
          // Explanation view
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">Error Explanation</div>
              <div>
                <button
                  type="button"
                  onClick={async () => {
                    // switch to explanation view and fetch
                    setOutputPanelView("explain");
                    await explainCurrentError();
                  }}
                  disabled={explainLoading}
                  className="rounded px-3 py-1 text-sm bg-white/6 hover:bg-white/10 transition text-white"
                >
                  {explainLoading ? "Explaining…" : "Explain Error"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-white/8 bg-black/40 p-3 text-sm text-white/80 max-h-96 overflow-auto">
              {explanation ? (
                <pre className="whitespace-pre-wrap">{explanation}</pre>
              ) : (
                <div className="text-xs text-white/50">Click "Explain Error" to get hints and suggestions.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
