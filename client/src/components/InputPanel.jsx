import React from "react";
import Timer from "./Timer";
import { Play, Pause } from "lucide-react";
import { useCompilerStore } from "../store/useCompilerStore";

// InputPanel: shows stdin textarea and a Timer control in the header's right corner

export default function InputPanel() {
  const { stdin, setStdin } = useCompilerStore();
  const [timerSeconds, setTimerSeconds] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/65">Input (stdin)</div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Timer hours"
            className="ui-control relative z-50 px-2"
            onChange={(e) => {
              const hours = Number(e.target.value) || 0;
              if (hours > 0) {
                setTimerSeconds(hours * 3600);
                setTimerRunning(true);
              } else {
                setTimerRunning(false);
                setTimerSeconds(0);
              }
            }}
            defaultValue={0}
          >
            <option value={0} style={{ color: '#000' }}>Timer</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
              <option key={h} value={h} style={{ color: '#000' }}>{h}h</option>
            ))}
          </select>
          {/* Show timer display whenever a timer is set; allow pausing/resuming */}
          {timerSeconds > 0 && (
            <div className="flex items-center gap-2">
              <Timer
                initialSeconds={timerSeconds}
                running={timerRunning}
                onFinish={() => {
                  setTimerRunning(false);
                  setTimerSeconds(0);
                }}
              />
              <button
                type="button"
                aria-label={timerRunning ? "Pause timer" : "Start timer"}
                onClick={() => setTimerRunning((s) => !s)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded bg-white/5 p-2 text-white transition hover:bg-white/10"
                title={timerRunning ? "Pause" : "Play"}
              >
                {timerRunning ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>
      <textarea
        className="ui-mono-panel flex-1 w-full resize-none p-3 text-sm text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-indigo-500/40"
        placeholder="Type full stdin before Run (example: 5 or multi-line values)…"
        value={stdin}
        onChange={(e) => setStdin(e.target.value)}
      />
      <div className="mt-2 text-xs text-white/50">
        Input is non-interactive: enter all values here first, then click Run.
      </div>
    </div>
  );
}
