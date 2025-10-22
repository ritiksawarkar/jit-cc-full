import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App";
import ToastProvider from "./components/ToastProvider";
import { useCompilerStore } from "./store/useCompilerStore";

function ThemeSync() {
  const theme = useCompilerStore((s) => s.theme);

  useEffect(() => {
    try {
      // Apply a data attribute so CSS can target a theme if needed
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.setAttribute('data-theme', String(theme || 'light'));
        // Toggle Tailwind's dark mode class for non-light editor themes
        if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
      }
    } catch (e) {
      // swallow errors in environments without DOM
    }
  }, [theme]);

  return null;
}

const container = document.getElementById("root");
if (!container) throw new Error('Root container not found');
if (!window.__app_root) {
  window.__app_root = createRoot(container);
}
window.__app_root.render(
  <React.StrictMode>
    <ThemeSync />
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
