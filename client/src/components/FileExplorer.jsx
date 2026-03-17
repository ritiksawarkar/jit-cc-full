import React, { useState, useEffect, useRef, useCallback } from "react";
import { useCompilerStore } from "../store/useCompilerStore";
import { getProjectStructure, readFile, deleteFile, renameFile, createFile, searchFiles, saveFile } from "../services/api";
import { createFolder } from "../services/api"; // Added createFolder import
import ToastProvider, { useToast } from "./ToastProvider"; // Added ToastProvider and useToast import
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
  CheckCircle,
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

export default function FileExplorer() {
  const {
    tabs,
    activeTabId,
    selectTab,
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
  const [selectedForRename, setSelectedForRename] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedTab, setDraggedTab] = useState(null);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [showCreateFileHeader, setShowCreateFileHeader] = useState(false);
  const [newFileNameHeader, setNewFileNameHeader] = useState("");
  const [showCreateFolderHeader, setShowCreateFolderHeader] = useState(false);
  const [newFolderNameHeader, setNewFolderNameHeader] = useState("");
  const [creatingFileAt, setCreatingFileAt] = useState(null); // folder path or "" for root
  const [creatingFileDraft, setCreatingFileDraft] = useState("");
  const creatingInputRef = useRef(null);
  const renameInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  // attempt to use toast; if ToastProvider isn't mounted, fall back to window.alert
  let toast;
  try {
    toast = useToast();
  } catch (e) {
    toast = { push: (msg, opts) => { try { alert(msg); } catch {} } };
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
      } catch {}
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
      } catch (e) {}
    }
  }, [selectedForRename]);

  // Listen for keyboard shortcut to create new file (Ctrl+N)
  useEffect(() => {
    const handleCreateNewFile = () => {
      setShowCreateFile(true);
      setNewFileName("");
    };

    window.addEventListener("create-new-file", handleCreateNewFile);
    return () => window.removeEventListener("create-new-file", handleCreateNewFile);
  }, []);

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
    } catch {}
    if (query.trim().length < 2) {
      setLocalSearchResults([]);
      // clear results in the global store as well
      try {
        setSearchResults([]);
      } catch {}
      return;
    }
    
    setLocalIsSearching(true);
    try {
      const results = await searchFiles(query, 30);
      setLocalSearchResults(results.results || []);
      try {
        setSearchResults(results.results || []);
      } catch {}
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
      } catch {}
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

  // File preview handler - opens file in editor
  const handleFilePreview = async (filePath, fileName) => {
    try {
      const data = await readFile(filePath);
      
      // Determine language ID based on file extension
      const ext = fileName.split(".").pop().toLowerCase();
      let langId = 63; // Default to JavaScript
      
      const extToLangMap = {
        js: 63,
        jsx: 63,
        ts: 74,
        tsx: 74,
        py: 71,
        cpp: 54,
        c: 50,
        java: 52,
        rs: 73,
        go: 60,
        clj: 86,
      };
      
      if (ext in extToLangMap) {
        langId = extToLangMap[ext];
      }
      
      // If the file is already open in a tab, select that tab and update its content.
      const state = useCompilerStore.getState();
      // Prefer matching by full path if tabs have a path, otherwise fall back to name
      const opened = (state.tabs || []).find((t) => (t.path ? t.path === filePath : t.name === fileName));
      if (opened) {
        // Select existing tab and update content (ensure string)
        if (state.selectTab) state.selectTab(opened.id);
        if (state.updateTabContent) state.updateTabContent(opened.id, String(data.content || ""));
      } else {
        // Create new tab with file content (ensure string)
        createTab({
          name: fileName,
          path: filePath,
          content: String(data.content || ""),
          isCustomName: true,
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

  // Handle file creation
  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const newFile = {
      path: `${currentPath.join("/")}/${newFileName}`,
      name: newFileName,
      timestamp: new Date().toISOString(),
    };
    addRecentlyOpened(newFile.path, newFile.name);
    setNewFileName("");
    setShowCreateFile(false);
  };

  // Shared create helper used by header inline inputs
  const createFileAndRefresh = async (path, content = "// New file\n") => {
    try {
      await createFile(path, content);
      await loadStructure();
      // if created in root, ensure root expanded
      setExpandedFolders((prev) => prev);
      try { addRecentlyOpened(path, path.split('/').pop()); } catch {}
      return true;
    } catch (err) {
      console.error('Create failed:', err);
      toast.push(`Failed to create: ${err?.message || err}`, { type: 'error' });
      return false;
    }
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

  // Handle create file via API
  const handleCreateFileAPI = async () => {
    const name = (newFileName || "").trim();
    if (!name) {
      toast.push("Please enter a file name (including extension), e.g. main.cpp", { type: 'error' });
      return;
    }

    // Validate extension exists and is allowed
    const extMatch = name.match(/\.([a-z0-9]+)$/i);
    if (!extMatch) {
      toast.push("File extension required. Please include an extension like .js, .py, .cpp", { type: 'error' });
      return;
    }
    const ext = extMatch[1].toLowerCase();
    const allowed = new Set(["js","jsx","ts","tsx","py","java","c","cpp","rs","go","html","css","json","md","txt","sh","bash","yml","yaml"]);
    if (!allowed.has(ext)) {
      toast.push(`Invalid or unsupported extension '.${ext}'. Allowed: ${Array.from(allowed).join(', ')}`, { type: 'error' });
      return;
    }
    
    try {
      // If no folder selected, create in root, otherwise in selected folder
      const basePath = currentPath.length > 0 ? currentPath.join("/") : "";
      let newPath = basePath ? `${basePath}/${newFileName}` : newFileName;
      
      // Ensure path doesn't start with /
      if (newPath.startsWith("/")) {
        newPath = newPath.substring(1);
      }
      
  await createFile(newPath, "// New file\n");
      
      // Reload structure
      const data = await getProjectStructure();
      setProjectStructure(data.structure || []);
      
      // Auto-navigate to the file's directory if in root
      if (currentPath.length === 0 && basePath === "") {
        // File created in root - navigate to root to show it
        setCurrentPath([]);
      }
      
      // Auto-expand the folder containing the new file
      if (basePath) {
        setExpandedFolders((prev) => {
          const expanded = new Set(prev);
          expanded.add(basePath);
          return Array.from(expanded);
        });
      }
      
      setNewFileName("");
      setShowCreateFile(false);
      
      // Open new file in preview
      addRecentlyOpened(newPath, newFileName);
    } catch (err) {
      console.error("Create failed:", err);
      const errorMsg = err.response?.data?.error || err.message;
      
      if (err.response?.status === 409) {
        toast.push(`⚠️ File already exists: ${newFileName}`, { type: 'error' });
      } else {
        toast.push(`❌ Failed to create file: ${errorMsg}`, { type: 'error' });
      }
    }
  };

  // Header inline create handlers
  const handleHeaderCreateFile = async () => {
    const name = (newFileNameHeader || "").trim();
    if (!name) {
      setShowCreateFileHeader(false);
      setNewFileNameHeader("");
      return;
    }
    // validate extension
    const extMatch = name.match(/\.([a-z0-9]+)$/i);
    if (!extMatch) {
      toast.push('Please include a file extension, e.g. main.js', { type: 'error' });
      return;
    }
    const target = name.startsWith('/') ? name.slice(1) : name;
    const ok = await createFileAndRefresh(target, "// New file\n");
    if (ok) {
      setNewFileNameHeader("");
      setShowCreateFileHeader(false);
    }
  };

  const handleHeaderCreateFolder = async () => {
    const name = (newFolderNameHeader || "").trim();
    if (!name) {
      setShowCreateFolderHeader(false);
      setNewFolderNameHeader("");
      return;
    }
    const folder = name.replace(/^\/+/, '');
    try {
      await createFolder(folder);
      await loadStructure();
      setNewFolderNameHeader("");
      setShowCreateFolderHeader(false);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(folder);
        return Array.from(next);
      });
      // After creating a folder, offer to create a file inside it by
      // opening the header file-create input prefilled with "folder/"
      try {
        setNewFileNameHeader(`${folder}/`);
        setShowCreateFileHeader(true);
        // focus the header file input if available
        setTimeout(() => {
          try { fileInputRef.current?.focus?.(); } catch (e) {}
        }, 60);
      } catch (e) {}
    } catch (err) {
      console.error('Create folder failed:', err);
      const msg = err.response?.data?.error || err.message;
      toast.push(`Failed to create folder: ${msg}`, { type: 'error' });
    }
  };

  // Render tree recursively
  const renderTree = (items, parentPath = "", depth = 0) => {
    if (depth > 5) return null;
    const filtered = filterItems(items, searchQuery);

    return filtered.map((item) => {
      const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;

      if (item.type === "folder") {
        const isExpanded = expandedFolders.includes(itemPath);
        return (
          <div key={itemPath} className="space-y-0.5">
            <div
              onClick={() => toggleFolder(itemPath)}
              onContextMenu={(e) => handleContextMenu(e, item, itemPath)}
              className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer hover:bg-white/10 transition group"
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-white/60" />
              ) : (
                <ChevronRight size={14} className="text-white/60" />
              )}
              {isExpanded ? (
                <FolderOpen size={14} className="text-yellow-300" />
              ) : (
                <Folder size={14} className="text-yellow-300" />
              )}
              {/* per-folder quick-create: show small + to create a file inside this folder */}
              <div className="ml-1">
                <button
                  type="button"
                  title="Quick create untitled file inside folder"
                  onClick={(e) => {
                    e.stopPropagation();
                    // immediate create untitled file inside this folder
                    handleQuickCreateUntitledFile(itemPath).catch((err) => console.error(err));
                  }}
                  className="p-1 rounded hover:bg-white/10 text-white/40"
                >
                  <Plus size={12} />
                </button>
              </div>
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
                {/* Inline new-file input shown at the top of children when creatingFileAt === this folder */}
                {creatingFileAt === itemPath && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded">
                    <File size={12} className="text-white/40" />
                    <input
                      ref={creatingInputRef}
                      type="text"
                      placeholder="filename.ext"
                      value={creatingFileDraft}
                      onChange={(e) => setCreatingFileDraft(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          await handleCreateFileInline(itemPath);
                        }
                        if (e.key === 'Escape') {
                          setCreatingFileAt(null);
                          setCreatingFileDraft('');
                        }
                      }}
                      className="text-xs bg-black/20 border border-cyan-400 px-1 rounded text-white w-48"
                    />
                    <button
                      onClick={async (ev) => { ev.stopPropagation(); await handleCreateFileInline(itemPath); }}
                      className="p-1 rounded hover:bg-white/10 text-white/60"
                      title="Create file"
                    >
                      <CheckCircle size={14} />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setCreatingFileAt(null); setCreatingFileDraft(''); }}
                      className="p-1 rounded hover:bg-white/10 text-white/40"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
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

  // Inline create handler
  const handleCreateFileInline = async (folderPath) => {
    const name = (creatingFileDraft || '').trim();
    if (!name) {
      toast.push('Please enter a file name including extension', { type: 'error' });
      return;
    }

    const extMatch = name.match(/\.([a-z0-9]+)$/i);
    if (!extMatch) {
      toast.push('Please include a file extension, e.g. main.js', { type: 'error' });
      return;
    }
    const ext = extMatch[1].toLowerCase();
    const allowed = new Set(["js","jsx","ts","tsx","py","java","c","cpp","rs","go","html","css","json","md","txt","sh","bash","yml","yaml"]);
    if (!allowed.has(ext)) {
      toast.push(`Invalid extension '.${ext}'`, { type: 'error' });
      return;
    }

    // build relative path
    const base = folderPath || '';
    let rel = base ? `${base}/${name}` : name;
    if (rel.startsWith('/')) rel = rel.slice(1);

    // check duplicate
    const node = findNodeByPath(base);
    if ((node?.children || []).some(i => i.name === name && i.type === 'file')) {
      toast.push(`File already exists: ${name}`, { type: 'error' });
      return;
    }

    try {
      const ok = await createFileAndRefresh(rel, '// New file\n');
      if (ok) {
        // expand the folder
        if (base) setExpandedFolders((prev) => Array.from(new Set([...(prev||[]), base])));
        // open file in editor
        try { await handleFilePreview(rel, name); } catch (e) { console.error('open after create failed', e); }
        setCreatingFileAt(null);
        setCreatingFileDraft('');
      }
    } catch (err) {
      console.error('Inline create failed', err);
      toast.push(`Failed to create file: ${err.message || err}`, { type: 'error' });
    }
  };

  // Helper to pick a unique untitled name inside a folder
  const getNextUntitledName = (folderPath = '', isFolder = false) => {
    const node = findNodeByPath(folderPath);
    const children = node?.children || [];
    const base = isFolder ? 'untitled' : 'untitled';
    // For files, default extension .txt
    const ext = isFolder ? '' : '.txt';
    let candidate = `${base}${ext}`;
    let i = 1;
    const exists = (name) => children.some(c => c.name === name);
    while (exists(candidate)) {
      candidate = `${base}-${i}${ext}`;
      i += 1;
    }
    return candidate;
  };

  // Quick create an untitled file in folderPath ('' for root)
  const handleQuickCreateUntitledFile = async (folderPath = '') => {
    const name = getNextUntitledName(folderPath, false);
    const rel = folderPath ? `${folderPath}/${name}` : name;
    try {
      await createFileAndRefresh(rel, '// New file\n');
      // expand folder if needed
      if (folderPath) setExpandedFolders((prev) => Array.from(new Set([...(prev||[]), folderPath])));
      // don't auto-open the file; instead enter rename mode so the user can edit the name
      try {
        setSelectedForRename({ path: rel, item: { name, type: 'file' } });
        setRenameValue(name);
        // ensure the tree reflects the new item and give a tick for autofocus
        setTimeout(() => {
          // the input in FileItem has autoFocus; no explicit focus needed, but keep for safety
          try { document.querySelector(`input[value=\"${name}\"]`)?.focus?.(); } catch (e) {}
        }, 40);
      } catch (e) {
        console.error('enter rename mode failed', e);
      }
    } catch (err) {
      console.error('Quick untitled create failed', err);
      toast.push(`Failed to create file: ${err.message || err}`, { type: 'error' });
    }
  };

  // Quick create an untitled folder (and an initial untitled file inside)
  const handleQuickCreateUntitledFolder = async (parentPath = '') => {
    // choose folder name unique among parent's children
    const node = findNodeByPath(parentPath);
    const children = node?.children || [];
    let base = 'untitled-folder';
    let candidate = base;
    let i = 1;
    const existsFolder = (name) => children.some(c => c.name === name && c.type === 'folder');
    while (existsFolder(candidate)) {
      candidate = `${base}-${i}`;
      i += 1;
    }
    const relFolder = parentPath ? `${parentPath}/${candidate}` : candidate;
    try {
      await createFolder(relFolder);
      await loadStructure();
      setExpandedFolders((prev) => Array.from(new Set([...(prev||[]), parentPath, relFolder].filter(Boolean))));
      // enter rename mode for the new folder so the user can change its name immediately
      setSelectedForRename({ path: relFolder, item: { name: candidate, type: 'folder' } });
      setRenameValue(candidate);
    } catch (err) {
      console.error('Quick create folder failed', err);
      toast.push(`Failed to create folder: ${err.message || err}`, { type: 'error' });
    }
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
    <div className="h-full flex flex-col bg-gray-900/50 border-r border-white/10 overflow-hidden file-explorer">
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

      {/* Scrollable Content - Force scrollbar width to prevent layout shift */}
      <div className="flex-1 overflow-y-scroll text-sm text-white file-explorer-content">
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
          <div>
            <div className="px-4 py-2 text-xs font-semibold uppercase text-white/60 tracking-widest bg-black/20 flex items-center justify-between">
              <div>{currentPath.length > 0 ? "Project Files" : "Root Files"}</div>
              {currentPath.length === 0 && (
                <div className="flex items-center gap-2">
                  {/* Inline header create controls (no browser prompts) */}
                  {showCreateFileHeader ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={fileInputRef}
                        type="text"
                        placeholder="filename.ext or folder/name.ext"
                        value={newFileNameHeader}
                        onChange={(e) => setNewFileNameHeader(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleHeaderCreateFile();
                          if (e.key === 'Escape') { setShowCreateFileHeader(false); setNewFileNameHeader(''); }
                        }}
                        className="text-xs bg-black/20 border border-cyan-400 px-1 rounded text-white w-40"
                      />
                      <button
                        type="button"
                        onClick={handleHeaderCreateFile}
                        title="Create file"
                        className="p-1 rounded hover:bg-white/10 text-white/70"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreateFileHeader(false); setNewFileNameHeader(''); }}
                        title="Cancel"
                        className="p-1 rounded hover:bg-white/10 text-white/70"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title="Quick create untitled file in root"
                      onClick={() => {
                        handleQuickCreateUntitledFile("").catch((err) => console.error(err));
                      }}
                      className="p-1 rounded hover:bg-white/10 text-white/70"
                    >
                      <FilePlus size={14} />
                    </button>
                  )}

                  {showCreateFolderHeader ? (
                    <div className="flex items-center gap-1">
                        <Folder size={14} className="text-yellow-300" />
                      <input
                        type="text"
                        placeholder="folder name"
                        value={newFolderNameHeader}
                        onChange={(e) => setNewFolderNameHeader(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleHeaderCreateFolder();
                          if (e.key === 'Escape') { setShowCreateFolderHeader(false); setNewFolderNameHeader(''); }
                        }}
                        className="text-xs bg-black/20 border border-cyan-400 px-1 rounded text-white w-28"
                      />
                      <button
                        type="button"
                        onClick={handleHeaderCreateFolder}
                        title="Create folder"
                        className="p-1 rounded hover:bg-white/10 text-white/70"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreateFolderHeader(false); setNewFolderNameHeader(''); }}
                        title="Cancel"
                        className="p-1 rounded hover:bg-white/10 text-white/70"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title="Quick create untitled folder"
                      onClick={() => {
                        handleQuickCreateUntitledFolder(currentPath.join('/')).catch((err) => console.error(err));
                      }}
                      className="p-1 rounded hover:bg-white/10 text-white/70"
                    >
                      <FolderPlus size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="px-2 py-1 space-y-0.5">
              {/* Inline root create input when creatingFileAt === '' */}
              {creatingFileAt === "" && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded">
                  <File size={12} className="text-white/40" />
                  <input
                    ref={creatingInputRef}
                    type="text"
                    placeholder=""
                    value={creatingFileDraft}
                    onChange={(e) => setCreatingFileDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') { e.stopPropagation(); await handleCreateFileInline(''); }
                      if (e.key === 'Escape') { setCreatingFileAt(null); setCreatingFileDraft(''); }
                    }}
                    className="text-xs bg-black/20 border border-cyan-400 px-1 rounded text-white w-48"
                  />
                  <button
                    onClick={async (ev) => { ev.stopPropagation(); await handleCreateFileInline(''); }}
                    className="p-1 rounded hover:bg-white/10 text-white/60"
                    title="Create file"
                  >
                    <CheckCircle size={14} />
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setCreatingFileAt(null); setCreatingFileDraft(''); }}
                    className="p-1 rounded hover:bg-white/10 text-white/40"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
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
        {showCreateFile && (
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="File name..."
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFileAPI();
                if (e.key === "Escape") setShowCreateFile(false);
              }}
              autoFocus
              style={{ caretColor: '#ffffff' }}
              className="flex-1 px-2 py-1 text-xs rounded bg-black/20 border border-cyan-400 text-white placeholder:text-white/50 outline-none"
            />
            <button
              onClick={handleCreateFileAPI}
              className="p-1 rounded hover:bg-green-500/30 transition"
            >
              <Plus size={12} className="text-green-400" />
            </button>
            <button
              onClick={() => {
                setShowCreateFile(false);
                setNewFileName("");
              }}
              className="p-1 rounded hover:bg-red-500/30 transition"
            >
              <X size={12} className="text-red-400" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowCreateFile(true)}
          className="w-full min-h-9 rounded-md px-2 py-1.5 text-xs text-white/65 transition hover:bg-white/10 hover:text-white/85 flex items-center justify-center gap-1"
          title="Create new file"
        >
          <Plus size={12} /> New File
        </button>
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
