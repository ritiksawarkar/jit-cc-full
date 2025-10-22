import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TopBar from "./TopBar";
import EditorPanel from "./EditorPanel";
import InputPanel from "./InputPanel";
import OutputPanel from "./OutputPanel";
import TerminalPanel from "./TerminalPanel";
import FileExplorer from "./FileExplorer";
import { useCompilerStore } from "../store/useCompilerStore";

function TabsArea() {
  const [tab, setTab] = React.useState('input');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded-md text-sm font-medium ${tab === 'input' ? 'bg-cyan-500 text-black' : 'text-white/70 bg-white/3'}`}
            onClick={() => setTab('input')}
          >
            Input
          </button>
          <button
            className={`px-3 py-1 rounded-md text-sm font-medium ${tab === 'terminal' ? 'bg-cyan-500 text-black' : 'text-white/70 bg-white/3'}`}
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

export default function Shell() {
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
      <TopBar />
      <div className="flex-1 overflow-x-hidden">
        <div className="h-[calc(100vh-72px)] overflow-x-hidden w-full">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} maxSize={40}>
              <div className="bg-gray-900/50 backdrop-blur-xl border border-white/10 h-full w-full p-0 overflow-hidden">
                <FileExplorer />
              </div>
            </Panel>
            <PanelResizeHandle className="w-2 mx-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
            <Panel defaultSize={55} minSize={35}>
              <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden">
                <EditorPanel />
              </div>
            </Panel>
            <PanelResizeHandle className="w-2 mx-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
            {/* The three horizontal panels' default sizes should sum ~100 (20 + 55 + 25) */}
            <Panel defaultSize={25} minSize={25}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={45} minSize={20}>
                  <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden flex flex-col">
                    {/* Tabs: Input / Terminal share the same space */}
                    <TabsArea />
                  </div>
                </Panel>
                <PanelResizeHandle className="h-2 my-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
                <Panel defaultSize={55} minSize={30}>
                  <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-3 overflow-hidden">
                    <OutputPanel />
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  );
}
