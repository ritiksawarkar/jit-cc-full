import React, { useState, useEffect, useRef } from "react";
import { execCommand, getSettings } from "../services/api";
import Shimmer from "./Shimmer";
import { useToast } from "./ToastProvider";

export default function TerminalPanel() {
  const toast = useToast();
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState(".");
  const [projectRoot, setProjectRoot] = useState(null);
  const [running, setRunning] = useState(false);
  const [timeoutMs] = useState(10000);
  const [history, setHistory] = useState([]);
  const [histIndex, setHistIndex] = useState(null);
  const [log, setLog] = useState([]); // array of entries

  const outRef = useRef(null);
  const inputRef = useRef(null);
  const mirrorRef = useRef(null);

  // Focus input and ensure it's visible inside the scrollable terminal container
  const focusAndReveal = () => {
    const input = inputRef.current;
    const out = outRef.current;
    if (!input) return;
    try {
      input.focus();
      // If we have a scroll container, try to reveal the input's right edge
      if (out && typeof out.scrollLeft === 'number') {
        // scroll to the rightmost edge to ensure caret is visible
        out.scrollLeft = Math.max(0, out.scrollWidth - out.clientWidth);
        // also try scrollIntoView for the input element as a fallback
        if (input.scrollIntoView) input.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'end' });
      }
      // ensure the input itself scrolls to show the caret (right side)
      if (input && typeof input.scrollLeft === 'number') {
        revealInputCaret();
      }
    } catch (e) {
      /* ignore */
    }
  };

  // Create a hidden mirror element to measure text width (used to center caret)
  useEffect(() => {
    if (mirrorRef.current) return;
    const el = document.createElement('span');
    el.style.position = 'absolute';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.whiteSpace = 'pre';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    mirrorRef.current = el;
    return () => {
      try { document.body.removeChild(el); } catch (e) {}
      mirrorRef.current = null;
    };
  }, []);

  const measureTextWidth = (text) => {
    const input = inputRef.current;
    const el = mirrorRef.current;
    if (!el || !input) return 0;
    const style = window.getComputedStyle(input);
    // copy core font properties explicitly for accurate measurement
    el.style.fontSize = style.fontSize;
    el.style.fontFamily = style.fontFamily;
    el.style.fontWeight = style.fontWeight;
    el.style.fontStyle = style.fontStyle;
    el.style.letterSpacing = style.letterSpacing;
    el.style.fontVariant = style.fontVariant;
    el.style.lineHeight = style.lineHeight;
    // replace spaces with nbsp to preserve width
    el.textContent = text || '\u200b';
    return Math.ceil(el.getBoundingClientRect().width);
  };

  // Center the input view on the caret position (so start and end are roughly visible)
  const centerInputCaret = () => {
    const input = inputRef.current;
    const out = outRef.current;
    if (!input) return;
    try {
      const sel = input.selectionStart ?? input.value.length;
      const text = input.value.slice(0, sel);
      const px = measureTextWidth(text);
      const style = window.getComputedStyle(input);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const caretX = px + paddingLeft + borderLeft;
      const desired = Math.max(0, caretX - input.clientWidth / 2);
      input.scrollLeft = desired;

      // If container doesn't show the input fully, nudge container to reveal the input area
      if (out) {
        const inputRect = input.getBoundingClientRect();
        const outRect = out.getBoundingClientRect();
        if (inputRect.right > outRect.right) {
          out.scrollLeft += inputRect.right - outRect.right + 12;
        } else if (inputRect.left < outRect.left) {
          out.scrollLeft = Math.max(0, out.scrollLeft - (outRect.left - inputRect.left) - 12);
        }
      }
    } catch (e) {
      /* ignore */
      try { input.scrollLeft = input.scrollWidth; } catch (e) {}
    }
  };

  // Ensure the input element scrolls horizontally to keep caret visible
  const revealInputCaret = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.scrollLeft = input.scrollWidth;
    } catch (e) {
      /* ignore */
    }
  };

  // Adjust the input's width to fit the full command text so the entire command is visible
  const adjustInputWidth = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      // run inside rAF to ensure styles/value are updated
      window.requestAnimationFrame(() => {
        const text = input.value || input.placeholder || '';
        const px = measureTextWidth(text + '\u200b'); // include a hairspace
        const extra = 24; // padding + caret
        const desired = Math.max(120, Math.ceil(px + extra));
        input.style.display = 'inline-block';
        input.style.width = `${desired}px`;

        // ensure container reveals the input area (so user sees command)
        const out = outRef.current;
        if (out) {
          const inputRect = input.getBoundingClientRect();
          const outRect = out.getBoundingClientRect();
          // scroll so the right edge of the input is visible
          if (inputRect.right > outRect.right) {
            out.scrollLeft = Math.max(0, out.scrollLeft + (inputRect.right - outRect.right) + 12);
          }
          // if left edge is offscreen, bring it into view
          if (inputRect.left < outRect.left) {
            out.scrollLeft = Math.max(0, out.scrollLeft - (outRect.left - inputRect.left) - 12);
          }
        }
        // ensure the input itself scrolls to the end so caret is visible
        try { input.scrollLeft = input.scrollWidth; } catch (e) {}
      });
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [log, running]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getSettings();
        if (mounted) setProjectRoot(data.projectRoot || null);
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, []);

  const pushLog = (entry) => setLog((l) => [...l, entry]);

  const run = async (cmd) => {
    if (!cmd || !cmd.trim()) return;
    setRunning(true);
    setHistIndex(null);
    setHistory((h) => {
      const next = [...h];
      if (next[next.length - 1] !== cmd) next.push(cmd);
      return next.slice(-200);
    });

    const ts = new Date().toISOString();
    pushLog({ ts, type: 'cmd', cmd, cwd });

    try {
      const res = await execCommand({ command: cmd, cwd, timeoutMs });
      pushLog({ ts: new Date().toISOString(), type: 'result', cmd, stdout: res.stdout || "", stderr: res.stderr || "", code: res.code, timedOut: res.timedOut });
    } catch (err) {
      const message = err?.response?.data?.error || err.message || String(err);
      pushLog({ ts: new Date().toISOString(), type: 'error', cmd, message });
      toast.push({ type: 'error', title: 'Exec failed', message });
    } finally {
      setRunning(false);
      setTimeout(() => { focusAndReveal(); adjustInputWidth(); }, 30);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = command.trim();
      if (trimmed.startsWith('cd ')) {
        const arg = trimmed.slice(3).trim();
        if (!arg || arg === '~') {
          setCwd('.');
        } else if (arg === '..') {
          setCwd((prev) => {
            if (!prev || prev === '.') return '.';
            const parts = prev.split('/').filter(Boolean);
            parts.pop();
            return parts.length === 0 ? '.' : parts.join('/');
          });
        } else {
          const isAbsolute = /(^[A-Za-z]:\\)|(^\\\\)|(^\/)/.test(arg);
          if (isAbsolute && projectRoot) {
            const normRoot = projectRoot.replace(/\\/g, '/');
            const normArg = arg.replace(/\\/g, '/');
            if (normArg.startsWith(normRoot.replace(/\\+$/,''))) {
              let rel = normArg.slice(normRoot.length).replace(/^\//, '');
              if (!rel) rel = '.';
              setCwd(rel);
            } else {
              toast.push('cd: path outside project root is not allowed', { type: 'error' });
            }
          } else {
            setCwd((prev) => {
              if (!prev || prev === '.') return arg.replace(/\\/g, '/');
              return `${prev}/${arg}`.replace(/\\+/g, '/').replace(/\\/g, '/');
            });
          }
        }
        setCommand('');
        return;
      }
      run(trimmed);
      setCommand('');
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistIndex((i) => {
        const next = i === null ? history.length - 1 : Math.max(0, i - 1);
        const cmd = history[next] || '';
        setCommand(cmd);
        return next;
      });
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistIndex((i) => {
        if (i === null) return null;
        const next = Math.min(history.length - 1, i + 1);
        const cmd = history[next] || '';
        setCommand(cmd);
        return next === history.length - 1 ? null : next;
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
  <div className="ui-mono-panel flex-1 overflow-auto p-3 text-sm" ref={outRef} style={{ overflowX: 'auto' }}>
        {running && log.length === 0 ? (
          <div>
            <Shimmer lines={6} />
            <div className="mt-2 text-xs text-white/50">Running command…</div>
          </div>
        ) : (
          <div className="text-white">
            {log.length === 0 && (
              <div className="text-xs text-white/50 mb-3">No output yet. Type a command and press Enter.</div>
            )}

            {log.map((entry, idx) => (
              <div key={idx} className="mb-3">
                {entry.type === 'cmd' && (
                  <div className="text-xs text-white/60 mb-1">[{entry.ts}] $ {entry.cmd}</div>
                )}
                {entry.type === 'result' && (
                  <div>
                    {entry.stdout && (
                      <div>
                        <div className="text-xs text-white/60">Stdout:</div>
                        <pre className="whitespace-pre-wrap">{entry.stdout}</pre>
                      </div>
                    )}
                    {entry.stderr && (
                      <div className="mt-2">
                        <div className="text-xs text-red-400">Stderr:</div>
                        <pre className="whitespace-pre-wrap text-red-200">{entry.stderr}</pre>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-white/60">Exit: {String(entry.code)}{entry.timedOut ? ' (timed out)' : ''}</div>
                  </div>
                )}
                {entry.type === 'error' && (
                  <div className="text-xs text-red-400">Error: {entry.message}</div>
                )}
              </div>
            ))}

            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="w-full flex items-center font-mono text-sm text-white/60 min-w-0" style={{ whiteSpace: 'nowrap' }}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => focusAndReveal()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusAndReveal(); } }}
                  className="select-none cursor-text block"
                >
                  {projectRoot ? (cwd === '.' ? projectRoot : `${projectRoot.replace(/[\/]+$/,'')}/${cwd}`) : (cwd === '.' ? '/' : `/${cwd}`)}
                </span>
                <span className="mx-2 text-white/40 select-none">&gt;</span>
                <input
                  ref={inputRef}
                  autoFocus
                  tabIndex={0}
                  aria-label="Terminal command input"
                  onClick={() => { focusAndReveal(); adjustInputWidth(); }}
                  onFocus={() => { focusAndReveal(); adjustInputWidth(); }}
                  style={{ minWidth: 20, caretColor: 'white', overflowX: 'auto', whiteSpace: 'nowrap' }}
                  className="min-w-0 bg-transparent text-white p-0 ml-0 font-mono text-sm border-none focus:outline-none"
                  value={command}
                  onKeyDown={handleKeyDown}
                  onKeyUp={() => window.requestAnimationFrame(revealInputCaret)}
                  onChange={(e) => { setCommand(e.target.value); window.requestAnimationFrame(() => { revealInputCaret(); adjustInputWidth(); }); }}
                  placeholder=""
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
