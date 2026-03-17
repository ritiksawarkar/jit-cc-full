import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TopBar from "./TopBar";
import EditorPanel from "./EditorPanel";
import InputPanel from "./InputPanel";
import OutputPanel from "./OutputPanel";
import TerminalPanel from "./TerminalPanel";
import FileExplorer from "./FileExplorer";
import ProblemStatementPanel from "./ProblemStatementPanel";

function TabsArea() {
  const [tab, setTab] = React.useState('input');

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className={`ui-tab ${tab === 'input' ? 'ui-tab-active' : ''}`}
            onClick={() => setTab('input')}
          >
            Input
          </button>
          <button
            className={`ui-tab ${tab === 'terminal' ? 'ui-tab-active' : ''}`}
            onClick={() => setTab('terminal')}
          >
            Terminal
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'input' ? (
          <div className="h-full"><InputPanel /></div>
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
    <div className="relative z-0 min-h-screen flex flex-col overflow-x-hidden">
      <TopBar onToggleExplorer={() => setIsExplorerOpen((s) => !s)} />

      <div className="flex-1 overflow-x-hidden px-2 pb-2 sm:px-3 sm:pb-3">
        <div className="h-[calc(100vh-84px)] overflow-x-hidden">
          {/* Desktop: fixed 3-pane coding layout */}
          <div className="hidden h-full lg:block">
            <PanelGroup direction="horizontal" className="h-full min-h-0">
              <Panel defaultSize={20} minSize={15} maxSize={40}>
                <div className="ui-surface h-full min-h-0 w-full overflow-hidden bg-gray-900/50">
                  <FileExplorer />
                </div>
              </Panel>
              <PanelResizeHandle className="mx-1 w-2 rounded bg-white/5 transition-colors hover:bg-white/10" />

              <Panel defaultSize={55} minSize={35}>
                <div className="ui-surface h-full min-h-0 w-full overflow-hidden bg-black/50 p-2 sm:p-3">
                  <EditorPanel />
                </div>
              </Panel>

              <PanelResizeHandle className="mx-1 w-2 rounded bg-white/5 transition-colors hover:bg-white/10" />

              <Panel defaultSize={25} minSize={22}>
                <PanelGroup direction="vertical" className="h-full min-h-0">
                  <Panel defaultSize={45} minSize={20}>
                    <div className="ui-surface flex h-full min-h-0 w-full flex-col overflow-hidden bg-black/50 p-2 sm:p-3">
                      <TabsArea />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="my-1 h-2 rounded bg-white/5 transition-colors hover:bg-white/10" />
                  <Panel defaultSize={55} minSize={30}>
                    <div className="ui-surface h-full min-h-0 w-full overflow-hidden bg-black/50 p-2 sm:p-3">
                      <OutputPanel />
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </div>

          {/* Tablet: collapsible explorer + editor/output split */}
          <div className="hidden h-full min-h-0 md:grid md:grid-cols-2 md:gap-3 lg:hidden">
            <div className="ui-surface min-h-0 overflow-hidden bg-black/50 p-2 sm:p-3">
              <EditorPanel compact />
            </div>
            <div className="ui-surface min-h-0 overflow-hidden bg-black/50 p-2 sm:p-3">
              <PanelGroup direction="vertical" className="h-full min-h-0">
                <Panel defaultSize={45} minSize={25}>
                  <div className="h-full min-h-0 overflow-hidden">
                    <TabsArea />
                  </div>
                </Panel>
                <PanelResizeHandle className="my-1 h-2 rounded bg-white/5 transition-colors hover:bg-white/10" />
                <Panel defaultSize={55} minSize={30}>
                  <div className="h-full min-h-0 overflow-hidden">
                    <OutputPanel />
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </div>

          {/* Mobile: industry-standard tabs */}
          <div className="h-full md:hidden">
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
            className="absolute inset-0 bg-black/55"
            onClick={() => setIsExplorerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm overflow-hidden border-r border-white/10 bg-gray-950/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
              <div className="text-sm font-semibold text-white/85">Explorer</div>
              <button
                type="button"
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/80"
                onClick={() => setIsExplorerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-53px)] min-h-0">
              <FileExplorer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
