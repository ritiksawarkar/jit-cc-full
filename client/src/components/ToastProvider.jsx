import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // push accepts either:
  // - push(messageString, { type, timeout })
  // - push({ type, title, message }, opts?)
  const push = useCallback((msg, opts = {}) => {
    const id = Date.now() + Math.random();
    let type = opts.type || 'info';
    let timeout = opts.timeout === undefined ? 4000 : opts.timeout;

    // Normalize content to renderable React nodes
    let content = null;
    if (typeof msg === 'string') {
      content = msg;
      if (opts.type) type = opts.type;
    } else if (msg && typeof msg === 'object') {
      // msg may be { type, title, message }
      if (!opts.type && msg.type) type = msg.type;
      const title = msg.title;
      const message = msg.message || msg.msg || null;
      if (title && message) {
        content = (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
          </div>
        );
      } else if (title) {
        content = title;
      } else if (message) {
        content = message;
      } else {
        // fallback: stringify
        try {
          content = JSON.stringify(msg);
        } catch (e) {
          content = String(msg);
        }
      }
    } else {
      content = String(msg);
    }

    const toast = { id, content, type, timeout };
    setToasts((t) => [...t, toast]);
    if (toast.timeout > 0) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.timeout);
    }
    return id;
  }, []);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 9999 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 8,
              color: '#fff',
              background: t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#16a34a' : '#111827',
              boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
              minWidth: 160,
            }}
            onClick={() => remove(t.id)}
          >
            {t.content}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default ToastProvider;
