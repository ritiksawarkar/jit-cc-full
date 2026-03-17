import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchLeaderboard, submitScore } from '../services/api';
import { useCompilerStore } from '../store/useCompilerStore';

export default function Leaderboard({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState('');
  const { currentUser } = useCompilerStore();
  const listRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchLeaderboard(50);
      setItems(res.items || []);
    } catch (err) {
      console.error('Failed to load leaderboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub = useCompilerStore.subscribe((s) => s.leaderboardTick, (tick) => {
      // reload when tick increments
      load();
      // scroll list to top (handled after load by timeout)
      setTimeout(() => {
        try {
          if (listRef.current) listRef.current.scrollTop = 0;
        } catch (e) { }
      }, 80);
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert('Please login to submit a score');
      return;
    }
    const n = Number(score);
    if (!Number.isFinite(n) || isNaN(n)) {
      alert('Enter a valid number');
      return;
    }
    setSubmitting(true);
    try {
      await submitScore(n);
      setScore('');
      await load();
    } catch (err) {
      console.error('Submit failed', err);
      alert('Failed to submit score');
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 bg-gray-900/95 p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold tracking-wide sm:text-lg">Leaderboard</h3>
          <button className="text-sm text-white/60" onClick={onClose}>Close</button>
        </div>
        <div className="mb-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder={currentUser ? 'Enter score to submit' : 'Login to submit score'}
              className="ui-control flex-1"
              disabled={!currentUser || submitting}
            />
            <button className="min-h-10 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold" disabled={!currentUser || submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
        <div ref={listRef} className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2.5">
          {loading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : (
            <ol className="list-decimal list-inside space-y-2">
              {items.length === 0 && <li className="text-sm text-white/60">No scores yet</li>}
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-xs text-white/60">{new Date(it.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-2xl font-bold text-cyan-300">{it.score}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
