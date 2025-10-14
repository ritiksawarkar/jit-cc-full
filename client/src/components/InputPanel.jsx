import React from "react";
import Timer from "./Timer";
import { useCompilerStore } from "../store/useCompilerStore";

// InputPanel: shows stdin textarea and a Timer control in the header's right corner

export default function InputPanel() {
  const { stdin, setStdin, explainCurrentError, setOutputPanelView } = useCompilerStore();
  const [timerSeconds, setTimerSeconds] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-white/70">Input (stdin)</div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Timer hours"
            className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 transition-colors relative z-50"
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
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => (
              <option key={h} value={h} style={{ color: '#000' }}>{h}h</option>
            ))}
          </select>
          <button
            type="button"
            onClick={async () => {
              try {
                setOutputPanelView("explain");
                await explainCurrentError();
              } catch (e) {}
            }}
            className="rounded px-2 py-1 bg-white/6 hover:bg-white/10 text-white text-sm transition"
          >
            Explain Error
          </button>
          {timerRunning && (
            <Timer initialSeconds={timerSeconds} running={timerRunning} onFinish={() => { setTimerRunning(false); setTimerSeconds(0); }} />
          )}
        </div>
      </div>
      <textarea
        className="flex-1 w-full bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-3 resize-none outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono text-white placeholder-white/50"
        placeholder="Type input for your program…"
        value={stdin}
        onChange={(e) => setStdin(e.target.value)}
      />
    </div>
  );
}
