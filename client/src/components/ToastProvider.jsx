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

    // Normalize payload into title/message/content so UI can render rich cards.
    let title = null;
    let message = null;
    let content = null;
    if (typeof msg === 'string') {
      message = msg;
      content = msg;
      if (opts.type) type = opts.type;
    } else if (msg && typeof msg === 'object') {
      // msg may be { type, title, message }
      if (!opts.type && msg.type) type = msg.type;
      title = msg.title || null;
      message = msg.message || msg.msg || null;
      if (title && message) {
        content = message;
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
      message = String(msg);
    }

    const toast = { id, content, type, timeout, title, message };
    setToasts((t) => [...t, toast]);
    if (toast.timeout > 0) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.timeout);
    }
    return id;
  }, []);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const getToastStyles = (type) => {
    if (type === 'error') {
      return {
        bg: 'linear-gradient(135deg, rgba(127,29,29,0.95), rgba(69,10,10,0.95))',
        border: '1px solid rgba(252,165,165,0.35)',
        accent: '#fca5a5',
      };
    }
    if (type === 'success') {
      return {
        bg: 'linear-gradient(135deg, rgba(6,78,59,0.95), rgba(2,44,34,0.95))',
        border: '1px solid rgba(110,231,183,0.35)',
        accent: '#6ee7b7',
      };
    }
    return {
      bg: 'linear-gradient(135deg, rgba(17,24,39,0.96), rgba(15,23,42,0.96))',
      border: '1px solid rgba(148,163,184,0.28)',
      accent: '#67e8f9',
    };
  };

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 9999, width: 'min(92vw, 380px)' }}>
        {toasts.map((t) => (
          (() => {
            const styles = getToastStyles(t.type);
            return (
              <div
                key={t.id}
                style={{
                  marginBottom: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  color: '#fff',
                  background: styles.bg,
                  border: styles.border,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                }}
                onClick={() => remove(t.id)}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    marginTop: 6,
                    borderRadius: 999,
                    background: styles.accent,
                    boxShadow: `0 0 12px ${styles.accent}`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {t.title ? (
                    <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.2, marginBottom: 4 }}>
                      {t.title}
                    </div>
                  ) : null}
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35, fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
                    {t.message || t.content}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close notification"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t.id);
                  }}
                  style={{
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.85)',
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  x
                </button>
              </div>
            );
          })()
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
