import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Timer from "./Timer";
import { Play, Pause } from "lucide-react";
import TopBar from "./TopBar";
import EditorPanel from "./EditorPanel";
import InputPanel from "./InputPanel";
import OutputPanel from "./OutputPanel";
import TerminalPanel from "./TerminalPanel";
import FileExplorer from "./FileExplorer";
import ProblemStatementPanel from "./ProblemStatementPanel";

function formatHms(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function TabsArea() {
  const [tab, setTab] = React.useState("input");
  const [eventTimer, setEventTimer] = React.useState({
    active: false,
    expired: false,
    remainingSeconds: 0,
  });
  const [timerSeconds, setTimerSeconds] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
        <div className="flex items-center gap-2 shrink-0">
          <button
            className={`ui-tab ${tab === "input" ? "ui-tab-active" : ""}`}
            onClick={() => setTab("input")}
          >
            Input
          </button>
          <button
            className={`ui-tab ${tab === "terminal" ? "ui-tab-active" : ""}`}
            onClick={() => setTab("terminal")}
          >
            Terminal
          </button>
        </div>

        {tab === "input" && (
          <>
            {/* <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/65">Input (stdin)</div> */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {eventTimer.active ? (
                <div className={`rounded-md px-3 py-1 text-sm font-mono ${eventTimer.expired
                  ? "bg-red-500/15 text-red-200"
                  : "bg-amber-500/15 text-amber-100"
                  }`}>
                  {formatHms(eventTimer.remainingSeconds)}
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
                    <option value={0} style={{ color: "#000" }}>Timer</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                      <option key={h} value={h} style={{ color: "#000" }}>{h}h</option>
                    ))}
                  </select>
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
                        className="flex min-h-9 min-w-9 items-center justify-center rounded bg-white/5 p-2 text-white transition hover:bg-white/10"
                        title={timerRunning ? "Pause" : "Play"}
                      >
                        {timerRunning ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "input" ? (
          <div className="h-full"><InputPanel hideHeader onEventTimerChange={setEventTimer} /></div>
        ) : (
          <div className="h-full"><TerminalPanel /></div>
        )}
      </div>
    </div>
  );
}

function MobileTabsArea() {
  const [tab, setTab] = React.useState("editor");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-1">
        {[
          { id: "problem", label: "Problem" },
          { id: "editor", label: "Editor" },
          { id: "output", label: "Output" },
          { id: "input", label: "Input" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ui-tab shrink-0 ${tab === item.id
              ? "ui-tab-active"
              : ""
              }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ui-surface min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        {tab === "problem" && <ProblemStatementPanel />}
        {tab === "editor" && <EditorPanel compact />}
        {tab === "output" && <OutputPanel />}
        {tab === "input" && <TabsArea />}
      </div>
    </div>
  );
}

export default function Shell() {
  const [isExplorerOpen, setIsExplorerOpen] = React.useState(false);

  // Handle global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+K or Cmd+K: Focus search in FileExplorer
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        // Find and focus the search input
        const searchInput = document.querySelector('input[placeholder="Search files..."]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Ctrl+N or Cmd+N: Create new file
      if ((event.ctrlKey || event.metaKey) && event.key === "n") {
        event.preventDefault();
        // Dispatch custom event to FileExplorer to show create file dialog
        window.dispatchEvent(new CustomEvent("create-new-file"));
      }

      // Ctrl+S is already handled in EditorPanel
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative z-0 flex min-h-screen flex-col overflow-x-hidden bg-gray-950">
      <TopBar onToggleExplorer={() => setIsExplorerOpen((s) => !s)} />

      {/* Main content area with improved responsive padding */}
      <div className="mt-0.5 flex-1 overflow-x-hidden bg-gray-950 px-1.5 pb-1.5 sm:mt-1 sm:px-2 sm:pb-2 md:px-3 md:pb-3 lg:px-2.5 lg:pb-2.5">
        <div className="h-[calc(100vh-84px)] overflow-x-hidden rounded-2xl bg-gray-950/30">
          {/* Desktop: fixed 3-pane coding layout */}
          <div className="hidden h-full lg:block">
            <PanelGroup direction="horizontal" className="h-full min-h-0">
              <Panel defaultSize={20} minSize={15} maxSize={40}>
                <div className="ui-surface h-full min-h-0 w-full overflow-hidden rounded-l-2xl border border-white/10 bg-gray-900/50 shadow-lg">
                  <FileExplorer />
                </div>
              </Panel>
              <PanelResizeHandle className="relative mx-0.5 w-1 bg-gradient-to-b from-transparent via-white/20 to-transparent transition-all hover:mx-1 hover:bg-white/30" />

              <Panel defaultSize={55} minSize={35}>
                <div className="ui-surface h-full min-h-0 w-full overflow-hidden border-y border-white/10 bg-black/50">
                  <EditorPanel />
                </div>
              </Panel>

              <PanelResizeHandle className="relative mx-0.5 w-1 bg-gradient-to-b from-transparent via-white/20 to-transparent transition-all hover:mx-1 hover:bg-white/30" />

              <Panel defaultSize={25} minSize={22}>
                <PanelGroup direction="vertical" className="h-full min-h-0">
                  <Panel defaultSize={45} minSize={20}>
                    <div className="ui-surface flex h-full min-h-0 w-full flex-col overflow-hidden border border-white/10 bg-black/50 shadow-lg">
                      <TabsArea />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="relative my-0.5 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all hover:my-1 hover:bg-white/30" />
                  <Panel defaultSize={55} minSize={30}>
                    <div className="ui-surface h-full min-h-0 w-full overflow-hidden rounded-r-2xl border border-white/10 bg-black/50 shadow-lg">
                      <OutputPanel />
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </div>

          {/* Tablet: collapsible explorer + editor/output split */}
          <div className="hidden h-full min-h-0 md:grid md:grid-cols-2 md:gap-2.5 lg:hidden">
            <div className="ui-surface min-h-0 overflow-hidden rounded-l-2xl border border-white/10 bg-black/50 p-1.5 sm:p-2 md:p-3 lg:p-4 shadow-md">
              <EditorPanel compact />
            </div>
            <div className="ui-surface min-h-0 overflow-hidden rounded-r-2xl border border-white/10 bg-black/50 shadow-md">
              <PanelGroup direction="vertical" className="h-full min-h-0">
                <Panel defaultSize={45} minSize={25}>
                  <div className="h-full min-h-0 overflow-hidden border-b border-white/10 p-1.5 sm:p-2 md:p-3 lg:p-4">
                    <TabsArea />
                  </div>
                </Panel>
                <PanelResizeHandle className="relative my-0.5 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all hover:my-1 hover:bg-white/30" />
                <Panel defaultSize={55} minSize={30}>
                  <div className="h-full min-h-0 overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
                    <OutputPanel />
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </div>

          {/* Mobile: industry-standard tabs */}
          <div className="h-full rounded-2xl border border-white/10 md:hidden">
            <MobileTabsArea />
          </div>
        </div>
      </div>

      {/* Collapsible Explorer Drawer for mobile/tablet */}
      {isExplorerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close explorer"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsExplorerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm overflow-hidden border-r border-white/20 bg-gray-950/98 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
              <div className="text-sm font-semibold tracking-wide text-white/85">File Explorer</div>
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 hover:border-white/40 hover:text-white transition-colors"
                onClick={() => setIsExplorerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-53px)] min-h-0 overflow-y-auto scroll-smooth">
              <FileExplorer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
