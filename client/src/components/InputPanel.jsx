import React from "react";
import Timer from "./Timer";
import { Play, Pause } from "lucide-react";
import { useCompilerStore } from "../store/useCompilerStore";

// InputPanel: shows stdin textarea and a Timer control in the header's right corner

const EVENT_ID_STORAGE_KEY = "compiler-event-id";
const EVENT_TIMER_SESSION_STORAGE_KEY = "compiler-event-timer-session";

function resolveActiveEventId() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = String(url.searchParams.get("eventId") || "").trim();
    if (/^[a-fA-F0-9]{24}$/.test(fromQuery)) {
      return fromQuery;
    }
    const fromStorage = String(
      window.localStorage.getItem(EVENT_ID_STORAGE_KEY) || "",
    ).trim();
    if (/^[a-fA-F0-9]{24}$/.test(fromStorage)) {
      return fromStorage;
    }
  } catch {
    // ignore URL/storage access errors
  }
  return "";
}

function loadEventSession() {
  try {
    const raw = window.localStorage.getItem(EVENT_TIMER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getRemainingSeconds(session) {
  const expiresAtMs = new Date(session?.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return 0;
  return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
}

function formatHms(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export default function InputPanel({ hideHeader = false, onEventTimerChange }) {
  const { stdin, setStdin } = useCompilerStore();
  const [timerSeconds, setTimerSeconds] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);
  const [eventTimer, setEventTimer] = React.useState({
    active: false,
    expired: false,
    remainingSeconds: 0,
  });

  React.useEffect(() => {
    const syncEventTimer = () => {
      const activeEventId = resolveActiveEventId();
      const session = loadEventSession();

      if (!activeEventId || !session || String(session.eventId || "") !== String(activeEventId)) {
        const nextState = {
          active: false,
          expired: false,
          remainingSeconds: 0,
        };
        setEventTimer(nextState);
        if (typeof onEventTimerChange === "function") {
          onEventTimerChange(nextState);
        }
        return;
      }

      const remainingSeconds = getRemainingSeconds(session);
      const nextState = {
        active: true,
        expired: remainingSeconds <= 0,
        remainingSeconds,
      };
      setEventTimer(nextState);
      if (typeof onEventTimerChange === "function") {
        onEventTimerChange(nextState);
      }
    };

    syncEventTimer();
    const intervalId = window.setInterval(syncEventTimer, 1000);
    window.addEventListener("popstate", syncEventTimer);
    window.addEventListener("storage", syncEventTimer);
    window.addEventListener("compiler-event-session-updated", syncEventTimer);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("popstate", syncEventTimer);
      window.removeEventListener("storage", syncEventTimer);
      window.removeEventListener("compiler-event-session-updated", syncEventTimer);
    };
  }, [onEventTimerChange]);

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/65">Input (stdin)</div>
          <div className="ml-auto flex items-center justify-end gap-2">
            {eventTimer.active ? (
              <div className={`rounded-md px-3 py-1 text-sm font-mono ${eventTimer.expired
                ? "bg-red-500/15 text-red-200"
                : "bg-amber-500/15 text-amber-100"
                }`}>
                Event Timer: {formatHms(eventTimer.remainingSeconds)}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
      <textarea
        className="ui-mono-panel flex-1 w-full resize-none p-3 text-sm text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-indigo-500/40"
        placeholder="Type full stdin before Run (example: 5 or multi-line values)…"
        value={stdin}
        onChange={(e) => setStdin(e.target.value)}
      />
      <div className="mt-2 text-xs text-white/50">
        {eventTimer.active
          ? (eventTimer.expired
            ? "Event timer expired: submissions are blocked for this event."
            : "Event timer started from your join time. Submit before it reaches zero.")
          : "Input is non-interactive: enter all values here first, then click Run."}
      </div>
    </div>
  );
}
