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
  const [viewportWidth, setViewportWidth] = React.useState(() => {
    if (typeof window === "undefined") return 1280;
    return window.innerWidth;
  });
  const [mobilePane, setMobilePane] = React.useState("editor");

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const isLaptop = viewportWidth >= 1024 && viewportWidth < 1366;
  const explorerDefaultSize = isLaptop ? 18 : 20;
  const editorDefaultSize = isLaptop ? 50 : 55;
  const sideDefaultSize = isLaptop ? 32 : 25;

  React.useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    <div className="relative z-0 h-[100dvh] min-h-[100dvh] flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 min-h-0 overflow-x-hidden">
        <div className="h-full overflow-x-hidden w-full">
          {isMobile ? (
            <div className="h-full px-2 pb-2 flex flex-col gap-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${mobilePane === "editor" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/5"}`}
                  onClick={() => setMobilePane("editor")}
                >
                  Editor
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${mobilePane === "explorer" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/5"}`}
                  onClick={() => setMobilePane("explorer")}
                >
                  Files
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${mobilePane === "io" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/5"}`}
                  onClick={() => setMobilePane("io")}
                >
                  Input / Terminal
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${mobilePane === "output" ? "bg-cyan-500 text-black" : "text-white/70 bg-white/5"}`}
                  onClick={() => setMobilePane("output")}
                >
                  Output
                </button>
              </div>

              <div className="flex-1 min-h-0">
                {mobilePane === "editor" && (
                  <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden rounded-xl">
                    <EditorPanel />
                  </div>
                )}
                {mobilePane === "explorer" && (
                  <div className="bg-gray-900/50 backdrop-blur-xl border border-white/10 h-full w-full p-0 overflow-hidden rounded-xl">
                    <FileExplorer />
                  </div>
                )}
                {mobilePane === "io" && (
                  <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden rounded-xl">
                    <TabsArea />
                  </div>
                )}
                {mobilePane === "output" && (
                  <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-3 overflow-hidden rounded-xl">
                    <OutputPanel />
                  </div>
                )}
              </div>

            </div>
          ) : isTablet ? (
            <PanelGroup key="tablet-layout" direction="vertical" className="h-full">
              <Panel id="tablet-editor" order={1} defaultSize={58} minSize={35}>
                <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden">
                  <EditorPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="h-2 my-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
              <Panel id="tablet-bottom" order={2} defaultSize={42} minSize={25}>
                <PanelGroup key="tablet-bottom-layout" direction="horizontal" className="h-full">
                  <Panel id="tablet-explorer" order={1} defaultSize={42} minSize={28}>
                    <div className="bg-gray-900/50 backdrop-blur-xl border border-white/10 h-full w-full p-0 overflow-hidden">
                      <FileExplorer />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="w-2 mx-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
                  <Panel id="tablet-right" order={2} defaultSize={58} minSize={35}>
                    <PanelGroup key="tablet-right-layout" direction="vertical" className="h-full">
                      <Panel id="tablet-io" order={1} defaultSize={45} minSize={25}>
                        <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden flex flex-col">
                          <TabsArea />
                        </div>
                      </Panel>
                      <PanelResizeHandle className="h-2 my-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
                      <Panel id="tablet-output" order={2} defaultSize={55} minSize={30}>
                        <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-3 overflow-hidden">
                          <OutputPanel />
                        </div>
                      </Panel>
                    </PanelGroup>
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          ) : (
            <PanelGroup key="desktop-layout" direction="horizontal" className="h-full">
              <Panel id="desktop-explorer" order={1} defaultSize={explorerDefaultSize} minSize={12} maxSize={40}>
                <div className="bg-gray-900/50 backdrop-blur-xl border border-white/10 h-full w-full p-0 overflow-hidden">
                  <FileExplorer />
                </div>
              </Panel>
              <PanelResizeHandle className="w-2 mx-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
              <Panel id="desktop-editor" order={2} defaultSize={editorDefaultSize} minSize={30}>
                <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden">
                  <EditorPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="w-2 mx-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
              <Panel id="desktop-right" order={3} defaultSize={sideDefaultSize} minSize={22}>
                <PanelGroup key="desktop-right-layout" direction="vertical" className="h-full">
                  <Panel id="desktop-io" order={1} defaultSize={45} minSize={20}>
                    <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-2 overflow-hidden flex flex-col">
                      <TabsArea />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="h-2 my-1 bg-white/5 rounded hover:bg-white/10 transition-colors" />
                  <Panel id="desktop-output" order={2} defaultSize={55} minSize={30}>
                    <div className="bg-black/50 backdrop-blur-xl border border-white/10 h-full w-full p-3 overflow-hidden">
                      <OutputPanel />
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>
    </div>
  );
}
