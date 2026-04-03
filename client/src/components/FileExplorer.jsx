import React, { useState, useEffect, useRef, useCallback } from "react";
import { useCompilerStore } from "../store/useCompilerStore";
import { getProjectStructure, readFile, deleteFile, renameFile, createFile, searchFiles, saveFile } from "../services/api";
import { createFolder } from "../services/api"; // Added createFolder import
import ToastProvider, { useToast } from "./ToastProvider"; // Added ToastProvider and useToast import
import { getJudge0LanguageIdFromFileName } from "../lib/languageUtils";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Code,
  Search,
  Trash2,
  Copy,
  Edit2,
  Plus,
  X,
  Clock,
  Eye,
  Star,
  Save,
  AlertCircle,
  FolderPlus,
  FilePlus,
} from "lucide-react";

// Debounce utility for performance optimization
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Memoized file item component for performance
const FileItem = React.memo(({ item, itemPath, selectedForRename, renameValue, onRenameChange, onRenameBlur, onRenameKeyDown, onFileClick, onDoubleClick, onContextMenu, onDragStart, getFileTypeIcon, onRenameClick, onDeleteClick, renameRef }) => {
  return (
    <div
      onClick={onFileClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer hover:bg-white/10 transition group"
    >
      {selectedForRename?.path === itemPath ? (
        <>
          <File size={12} className="text-white/40" />
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={onRenameChange}
            onBlur={onRenameBlur}
            onKeyDown={onRenameKeyDown}
            className="text-xs bg-black/50 border border-cyan-400 px-1 rounded text-white"
          />
        </>
      ) : (
        <>
          <File size={12} className="text-white/40" />
          <span className="text-xs text-white/60 truncate">{item.name}</span>

          {/* Hover actions: appear on row hover */}
          <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (onRenameClick) onRenameClick(itemPath); }}
              title="Rename"
              className="p-1 rounded hover:bg-white/10 text-white/50"
            >
              <Edit2 size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (onDeleteClick) onDeleteClick(itemPath); }}
              title="Delete"
              className="p-1 rounded hover:bg-red-500/20 text-red-300"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
});
FileItem.displayName = "FileItem";

// Map language IDs to file icons
const LANGUAGE_ICONS = {
  63: { icon: Code, label: "JavaScript", ext: ".js" },
  50: { icon: Code, label: "C", ext: ".c" },
  54: { icon: Code, label: "C++", ext: ".cpp" },
  52: { icon: Code, label: "Java", ext: ".java" },
  70: { icon: Code, label: "Python", ext: ".py" },
  71: { icon: Code, label: "Python 3", ext: ".py" },
  73: { icon: Code, label: "Rust", ext: ".rs" },
  60: { icon: Code, label: "Go", ext: ".go" },
  86: { icon: Code, label: "Clojure", ext: ".clj" },
};

const ROOT_FOLDER_ID = "root";

export default function FileExplorer() {
  const {
    tabs,
    activeTabId,
    selectTab,
    setLanguageId,
    closeTab,
    duplicateTab,
    createTab,
    recentlyOpened,
    addRecentlyOpened,
    clearRecentlyOpened,
    favorites,
    toggleFavorite,
    isFavorite,
    setSearchQuery: setStoreSearchQuery,
    setSearchResults,
    setIsSearching,
  } = useCompilerStore();

  const [expandedFolders, setExpandedFolders] = useState([]);
  const searchQuery = useCompilerStore((s) => s.searchQuery);
  const [searchResults, setLocalSearchResults] = useState([]);
  const [isSearching, setLocalIsSearching] = useState(false);
  const [projectStructure, setProjectStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_FOLDER_ID);
  const [selectedForRename, setSelectedForRename] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedTab, setDraggedTab] = useState(null);
  const [creatingNode, setCreatingNode] = useState(null);
  const [tempName, setTempName] = useState("");
  const explorerRef = useRef(null);
  const creatingInputRef = useRef(null);
  const creatingInputWrapRef = useRef(null);
  const renameInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  // attempt to use toast; if ToastProvider isn't mounted, fall back to window.alert
  let toast;
  try {
    toast = useToast();
  } catch (e) {
    toast = { push: (msg, opts) => { try { alert(msg); } catch { } } };
  }

  // Load project structure
  // Reusable loader for project structure so other handlers (and events) can call it
  const loadStructure = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProjectStructure();
      const structure = data.structure || [];

      setProjectStructure(structure);
    } catch (err) {
      console.error("Failed to load project structure:", err);
      setProjectStructure([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStructure();

    // Load persisted expanded folders
    const stored = localStorage.getItem("esm-file-explorer-expanded");
    if (stored) {
      try {
        setExpandedFolders(JSON.parse(stored));
      } catch { }
    }

    // Listen for external changes to project structure (rename/delete/create from editor)
    const onProjectChange = () => {
      loadStructure();
    };
    window.addEventListener("project-structure-changed", onProjectChange);
    return () => window.removeEventListener("project-structure-changed", onProjectChange);
  }, [loadStructure]);

  // when selectedForRename toggles to a path, focus and select the input
  useEffect(() => {
    if (selectedForRename && renameInputRef.current) {
      try {
        renameInputRef.current.focus();
        renameInputRef.current.select();
      } catch (e) { }
    }
  }, [selectedForRename]);

  useEffect(() => {
    if (!creatingNode) {
      return;
    }

    const handlePointerDown = (event) => {
      if (creatingInputWrapRef.current && !creatingInputWrapRef.current.contains(event.target)) {
        setCreatingNode(null);
        setTempName("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [creatingNode]);

  useEffect(() => {
    if (creatingNode && creatingInputRef.current) {
      try {
        creatingInputRef.current.focus();
        creatingInputRef.current.select();
        creatingInputRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (e) { }
    }
  }, [creatingNode]);

  // Get file icon based on extension
  const getFileTypeIcon = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    const iconMap = {
      js: "🟨", jsx: "⚛️", ts: "🔵", tsx: "⚛️",
      py: "🐍", cpp: "⚙️", c: "⚙️", h: "⚙️",
      java: "☕", rs: "🦀", go: "🐹", clj: "λ",
      json: "{ }", html: "🏷️", css: "🎨", md: "📝",
      txt: "📄", yml: "📋", yaml: "📋", xml: "📦",
      sh: "💻", bash: "💻", git: "📂", lock: "🔒"
    };
    return iconMap[ext] || "📄";
  };

  // Find a folder node in the projectStructure by a path like 'src/components'
  const findNodeByPath = (pathStr) => {
    if (!pathStr || pathStr === "") return { children: projectStructure };
    const parts = pathStr.split("/");
    let items = projectStructure;
    for (const part of parts) {
      if (!items) return null;
      const node = items.find((it) => it.type === "folder" && it.name === part);
      if (!node) return null;
      items = node.children || [];
    }
    return { children: items };
  };

  // Base search function (non-debounced)
  const executeSearch = useCallback(async (query) => {
    // Update the global store with the current query so TopBar / other components stay in sync
    try {
      setStoreSearchQuery(query);
    } catch { }
    if (query.trim().length < 2) {
      setLocalSearchResults([]);
      // clear results in the global store as well
      try {
        setSearchResults([]);
      } catch { }
      return;
    }

    setLocalIsSearching(true);
    try {
      const results = await searchFiles(query, 30);
      setLocalSearchResults(results.results || []);
      try {
        setSearchResults(results.results || []);
      } catch { }
    } catch (err) {
      console.error("Search failed:", err);
      setLocalSearchResults([]);
    } finally {
      setLocalIsSearching(false);
    }
  }, []);

  // Create debounced search handler using useRef
  const debouncedSearchRef = useRef(debounce(executeSearch, 300));
  const handleSearch = useCallback((query) => {
    debouncedSearchRef.current(query);
  }, [executeSearch]);

  // Save expanded folders
  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => {
      const next = prev.includes(folderPath)
        ? prev.filter((f) => f !== folderPath)
        : [...prev, folderPath];
      try {
        localStorage.setItem("esm-file-explorer-expanded", JSON.stringify(next));
      } catch { }
      return next;
    });
  };

  // Handle tab drag start
  const handleTabDragStart = (tab, e) => {
    setDraggedTab(tab);
    e.dataTransfer.effectAllowed = "move";
  };

  // Handle tab drag over
  const handleTabDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // Handle tab drop (reorder)
  const handleTabDrop = (targetTab, e) => {
    e.preventDefault();
    if (!draggedTab || draggedTab.id === targetTab.id) {
      setDraggedTab(null);
      return;
    }
    // In a real app, you'd reorder tabs here via store actions
    setDraggedTab(null);
  };

  // Context menu handlers
  const handleContextMenu = (e, item, path) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      path,
      type: item.type,
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOutsideExplorerClick = (event) => {
      if (explorerRef.current && !explorerRef.current.contains(event.target)) {
        setSelectedFolderId(ROOT_FOLDER_ID);
      }
    };

    document.addEventListener("mousedown", handleOutsideExplorerClick);
    return () => document.removeEventListener("mousedown", handleOutsideExplorerClick);
  }, []);

  // File preview handler - opens file in editor
  const handleFilePreview = async (filePath, fileName) => {
    try {
      const data = await readFile(filePath);

      const state = useCompilerStore.getState();
      const detectedLanguageId = getJudge0LanguageIdFromFileName(
        fileName,
        state.languageId ?? 63,
      );

      // If the file is already open in a tab, select that tab and update its content.
      // Prefer matching by full path if tabs have a path, otherwise fall back to name
      const opened = (state.tabs || []).find((t) => (t.path ? t.path === filePath : t.name === fileName));
      if (opened) {
        // Select existing tab and update content (ensure string)
        if (state.selectTab) state.selectTab(opened.id);
        if (state.updateTabContent) state.updateTabContent(opened.id, String(data.content || ""));
        if (state.setLanguageId) state.setLanguageId(detectedLanguageId);
      } else {
        // Create new tab with file content (ensure string)
        createTab({
          name: fileName,
          path: filePath,
          content: String(data.content || ""),
          isCustomName: true,
          languageId: detectedLanguageId,
        });
      }

      // Track in recently opened
      addRecentlyOpened(filePath, fileName);
    } catch (err) {
      console.error("Failed to open file:", err);
      toast.push(`Error opening file: ${err.message}`, { type: 'error' });
    }
  };

  // Handler to open file directly in editor (same as handleFilePreview)
  const handleOpenFileInEditor = async (filePath, fileName) => {
    await handleFilePreview(filePath, fileName);
  };

  // Handle rename via API
  const handleRename = async (item, newName) => {
    if (newName.trim() && newName !== item.name) {
      try {
        const oldPath = selectedForRename.path;
        await renameFile(oldPath, newName);
        // Reload structure
        const data = await getProjectStructure();
        setProjectStructure(data.structure || []);
      } catch (err) {
        console.error("Rename failed:", err);
        toast.push(`Failed to rename: ${err.message}`, { type: 'error' });
      }
    }
    setSelectedForRename(null);
    setRenameValue("");
  };

  // Handle delete file via API
  const handleDeleteFile = async (filePath) => {
    if (!window.confirm(`Are you sure you want to delete this file?`)) {
      return;
    }
    try {
      await deleteFile(filePath);
      // Reload structure
      const data = await getProjectStructure();
      setProjectStructure(data.structure || []);
    } catch (err) {
      console.error("Delete failed:", err);
      toast.push(`Failed to delete: ${err.message}`, { type: 'error' });
    }
  };

  const getChildrenForPath = useCallback((parentId = "") => {
    const node = findNodeByPath(parentId);
    return node?.children || [];
  }, [projectStructure]);

  const startCreation = useCallback((type, parentId = "") => {
    if (creatingNode) {
      return;
    }
    if (parentId) {
      setExpandedFolders((prev) => Array.from(new Set([...(prev || []), parentId])));
    }
    setCreatingNode({ type, parentId });
    setTempName("");
  }, [creatingNode]);

  const resetCreation = useCallback(() => {
    setCreatingNode(null);
    setTempName("");
  }, []);

  // Listen for keyboard shortcut to create new file (Ctrl+N)
  useEffect(() => {
    const handleCreateNewFile = () => {
      const parentId = selectedFolderId === ROOT_FOLDER_ID ? "" : selectedFolderId;
      startCreation("file", parentId);
    };

    window.addEventListener("create-new-file", handleCreateNewFile);
    return () => window.removeEventListener("create-new-file", handleCreateNewFile);
  }, [selectedFolderId, startCreation]);

  const handleCreateKeyDown = useCallback(async (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      resetCreation();
      return;
    }

    if (e.key !== "Enter") {
      return;
    }

    e.preventDefault();
    if (!creatingNode) {
      return;
    }

    const name = tempName.trim();
    if (!name) {
      return;
    }

    if (name.includes("/")) {
      toast.push("Names cannot contain /", { type: 'error' });
      return;
    }

    const parentId = creatingNode.parentId || "";
    const siblings = getChildrenForPath(parentId);
    if (siblings.some((item) => item.name === name)) {
      toast.push(`A file or folder named '${name}' already exists here.`, { type: 'error' });
      return;
    }

    const relativePath = parentId ? `${parentId}/${name}` : name;

    try {
      if (creatingNode.type === "folder") {
        await createFolder(relativePath);
      } else {
        const extMatch = name.match(/\.([a-z0-9]+)$/i);
        if (!extMatch) {
          toast.push('Please include a file extension, e.g. main.js', { type: 'error' });
          return;
        }
        await createFile(relativePath, "// New file\n");
      }

      await loadStructure();
      if (parentId) {
        setExpandedFolders((prev) => Array.from(new Set([...(prev || []), parentId])));
      }
      resetCreation();
    } catch (err) {
      console.error('Create failed:', err);
      const msg = err?.response?.data?.error || err?.message || String(err);
      toast.push(`Failed to create ${creatingNode.type}: ${msg}`, { type: 'error' });
    }
  }, [creatingNode, tempName, getChildrenForPath, loadStructure, resetCreation, toast]);

  const renderCreationInput = useCallback((parentId = "") => {
    if (!creatingNode || creatingNode.parentId !== parentId) {
      return null;
    }

    return (
      <div ref={creatingInputWrapRef} className="flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5">
        {creatingNode.type === "folder" ? (
          <Folder size={14} className="text-yellow-300" />
        ) : (
          <File size={12} className="text-white/40" />
        )}
        <input
          ref={creatingInputRef}
          autoFocus
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          onKeyDown={handleCreateKeyDown}
          onBlur={resetCreation}
          placeholder={creatingNode.type === "folder" ? "folder name" : "file name.ext"}
          className="w-52 bg-transparent px-1 text-xs text-white outline-none placeholder:text-white/40"
        />
      </div>
    );
  }, [creatingNode, handleCreateKeyDown, resetCreation, tempName]);

  // Render tree recursively
  const renderTree = (items, parentPath = "", depth = 0) => {
    if (depth > 5) return null;
    const filtered = filterItems(items, searchQuery);

    return filtered.map((item) => {
      const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;

      if (item.type === "folder") {
        const isExpanded = expandedFolders.includes(itemPath);
        const isSelectedFolder = selectedFolderId === itemPath;
        return (
          <div key={itemPath} className="space-y-0.5">
            <div
              onClick={() => setSelectedFolderId(itemPath)}
              onDoubleClick={() => toggleFolder(itemPath)}
              onContextMenu={(e) => handleContextMenu(e, item, itemPath)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition group ${isSelectedFolder
                  ? "bg-cyan-500/15 ring-1 ring-cyan-400/35"
                  : "hover:bg-white/10"
                }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(itemPath);
                }}
                className="rounded p-0.5 text-white/60 hover:bg-white/10"
                title={isExpanded ? "Collapse folder" : "Expand folder"}
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="text-white/60" />
                ) : (
                  <ChevronRight size={14} className="text-white/60" />
                )}
              </button>
              {isExpanded ? (
                <FolderOpen size={14} className="text-yellow-300" />
              ) : (
                <Folder size={14} className="text-yellow-300" />
              )}
              {selectedForRename?.path === itemPath ? (
                <>
                  <Folder size={14} className="text-yellow-300" />
                  <input
                    ref={renameInputRef}
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(item, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(item, renameValue);
                      if (e.key === "Escape") setSelectedForRename(null);
                    }}
                    className="text-xs bg-black/50 border border-cyan-400 px-1 rounded text-white"
                  />
                </>
              ) : (
                <>
                  <span className="text-xs text-white/80 truncate">{item.name}/</span>

                  {/* Hover actions for folders (rename, delete) - appear on row hover */}
                  <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedForRename({ path: itemPath, item }); setRenameValue(item.name); }}
                      title="Rename"
                      className="p-1 rounded hover:bg-white/10 text-white/50"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (window.confirm(`Are you sure you want to delete folder '${item.name}'?`)) handleDeleteFile(itemPath); }}
                      title="Delete"
                      className="p-1 rounded hover:bg-red-500/20 text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
            {isExpanded && (
              <div className="pl-4 space-y-0.5 border-l border-white/5">
                {renderCreationInput(itemPath)}
                {item.children && item.children.length > 0 && renderTree(item.children, itemPath, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <FileItem
            key={itemPath}
            item={item}
            itemPath={itemPath}
            selectedForRename={selectedForRename}
            renameValue={renameValue}
            onRenameChange={(e) => setRenameValue(e.target.value)}
            onRenameBlur={() => handleRename(item, renameValue)}
            onRenameKeyDown={(e) => {
              if (e.key === "Enter") handleRename(item, renameValue);
              if (e.key === "Escape") setSelectedForRename(null);
            }}
            onFileClick={() => handleFilePreview(itemPath, item.name)}
            onDoubleClick={() => handleOpenFileInEditor(itemPath, item.name)}
            onContextMenu={(e) => handleContextMenu(e, item, itemPath)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("filePath", itemPath);
            }}
            getFileTypeIcon={getFileTypeIcon}
            renameRef={renameInputRef}
            onRenameClick={(path) => {
              setSelectedForRename({ path, item });
              setRenameValue(item.name);
            }}
            onDeleteClick={(path) => handleDeleteFile(path)}
          />
        );
      }
    });
  };

  const filterItems = (items, query) => {
    if (!query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(lowerQuery));
  };

  const getFileIcon = (tab) => {
    const langInfo = LANGUAGE_ICONS[tab.languageId] || {
      icon: File,
      label: "File",
      ext: ".txt",
    };
    return langInfo;
  };

  return (
    <ToastProvider>
      <div ref={explorerRef} className="h-full flex flex-col bg-gray-900/50 border-r border-white/10 overflow-hidden file-explorer">
        {/* Explorer Header */}
        <div className="ui-header">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Explorer
          </div>
        </div>

        {/* Breadcrumb Navigation */}
        {currentPath.length > 0 && (
          <div className="px-3 py-1 border-b border-white/10 flex items-center gap-1 text-xs text-white/60 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setCurrentPath([])}
              className="hover:text-white/80 transition"
            >
              /
            </button>
            {currentPath.map((segment, idx) => (
              <React.Fragment key={idx}>
                <span className="text-white/40">/</span>
                <button
                  onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                  className="hover:text-white/80 transition truncate"
                >
                  {segment}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Scrollable Content - keep controls fixed and scroll only the tree area */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden text-sm text-white file-explorer-content">
          {/* Search Results Section */}
          {searchQuery.length >= 2 && searchResults.length > 0 && (
            <div className="border-b border-white/10">
              <div className="px-4 py-2 text-xs font-semibold uppercase text-white/60 tracking-widest bg-black/20 flex items-center justify-between">
                <span>Search Results ({searchResults.length})</span>
                {isSearching && <span className="text-xs animate-spin">⏳</span>}
              </div>
              <div className="space-y-1 px-2 py-1">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="flex flex-col gap-0.5 text-xs text-white/70 hover:text-white/90 p-1.5 rounded hover:bg-white/10 cursor-pointer transition">
                    <div className="flex items-center gap-1">
                      <span>{getFileTypeIcon(result.file)}</span>
                      <span className="truncate font-mono text-xs text-cyan-400">{result.file}</span>
                    </div>
                    <div className="text-white/50 text-xs ml-4">
                      Line {result.lineNum}: {result.line}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project Files Section - Show when folder is selected OR when files exist in root */}
          {(currentPath.length > 0 || projectStructure.length > 0) && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="px-4 py-2 text-xs font-semibold uppercase text-white/60 tracking-widest bg-black/20 flex items-center justify-between">
                <div>{currentPath.length > 0 ? "Project Files" : "Root Files"}</div>
                {currentPath.length === 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Create file"
                      onClick={() => startCreation("file", selectedFolderId === ROOT_FOLDER_ID ? "" : selectedFolderId)}
                      className="p-1 rounded hover:bg-white/10 text-white/70"
                    >
                      <FilePlus size={14} />
                    </button>
                    <button
                      type="button"
                      title="Create folder"
                      onClick={() => startCreation("folder", selectedFolderId === ROOT_FOLDER_ID ? "" : selectedFolderId)}
                      className="p-1 rounded hover:bg-white/10 text-white/70"
                    >
                      <FolderPlus size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
                <div className="space-y-0.5">
                  {renderCreationInput("")}
                  {loading ? (
                    <div className="px-2 py-2 text-xs text-white/50">Loading...</div>
                  ) : projectStructure.length > 0 ? (
                    renderTree(projectStructure)
                  ) : (
                    <div className="px-2 py-2 text-xs text-white/50">
                      No files found
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty State - When no files exist anywhere */}
          {currentPath.length === 0 && projectStructure.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-xs text-white/40">
                select and create a folder and file
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-white/10 bg-black/20 px-2.5 py-2 space-y-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => startCreation("file", selectedFolderId === ROOT_FOLDER_ID ? "" : selectedFolderId)}
              className="flex-1 min-h-9 rounded-md px-2 py-1.5 text-xs text-white/65 transition hover:bg-white/10 hover:text-white/85 flex items-center justify-center gap-1"
              title="Create new file"
            >
              <Plus size={12} /> New File
            </button>
            <button
              type="button"
              onClick={() => startCreation("folder", selectedFolderId === ROOT_FOLDER_ID ? "" : selectedFolderId)}
              className="flex-1 min-h-9 rounded-md px-2 py-1.5 text-xs text-white/65 transition hover:bg-white/10 hover:text-white/85 flex items-center justify-center gap-1"
              title="Create new folder"
            >
              <FolderPlus size={12} /> New Folder
            </button>
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bg-black/90 border border-white/20 rounded-lg shadow-lg py-1 z-50"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          >
            <button
              onClick={() => {
                handleFilePreview(contextMenu.path, contextMenu.item.name);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 transition flex items-center gap-2"
            >
              <Eye size={12} /> Preview
            </button>
            <button
              onClick={() => {
                // Store both path and item so render logic (selectedForRename.path) works
                setSelectedForRename({ path: contextMenu.path, ...contextMenu.item });
                setRenameValue(contextMenu.item.name);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 transition flex items-center gap-2"
            >
              <Edit2 size={12} /> Rename
            </button>
            <button
              onClick={() => {
                if (contextMenu.type === "file") {
                  addRecentlyOpened(contextMenu.path, contextMenu.item.name);
                }
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 transition flex items-center gap-2"
            >
              <Copy size={12} /> Copy Path
            </button>
            <button
              onClick={() => {
                handleDeleteFile(contextMenu.path);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left text-xs text-red-300/70 hover:text-red-300 hover:bg-red-500/20 transition flex items-center gap-2"
            >
              <Trash2 size={12} /> Delete
            </button>
          </motion.div>
        )}
      </div>
    </ToastProvider>
  );
}
