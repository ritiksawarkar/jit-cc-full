import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchLeaderboard, submitScore } from "../services/api";
import { useCompilerStore } from "../store/useCompilerStore";

function medalTone(rank) {
  if (rank === 1) return "from-amber-300/40 to-amber-600/20 border-amber-300/40";
  if (rank === 2) return "from-slate-200/40 to-slate-500/20 border-slate-200/35";
  if (rank === 3) return "from-orange-300/40 to-orange-700/20 border-orange-300/35";
  return "from-cyan-500/10 to-blue-500/5 border-white/10";
}

function rankLabel(rank) {
  if (rank === 1) return "Champion";
  if (rank === 2) return "Runner-up";
  if (rank === 3) return "Third Place";
  return `Rank #${rank}`;
}

export default function Leaderboard({ onClose }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ totalPlayers: 0, topScore: 0, averageScore: 0 });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState("");
  const [query, setQuery] = useState("");
  const { currentUser } = useCompilerStore();
  const listRef = useRef(null);

  const load = async (keepScroll = false) => {
    setLoading(true);
    try {
      const res = await fetchLeaderboard(50);
      setItems(res.items || []);
      setStats(res.stats || { totalPlayers: 0, topScore: 0, averageScore: 0 });
    } catch (err) {
      console.error("Failed to load leaderboard", err);
    } finally {
      setLoading(false);
      if (!keepScroll) {
        setTimeout(() => {
          try {
            if (listRef.current) listRef.current.scrollTop = 0;
          } catch {
            // ignore
          }
        }, 80);
      }
    }
  };

  useEffect(() => {
    load();
    const unsub = useCompilerStore.subscribe((s) => s.leaderboardTick, () => {
      load();
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Please login to submit a score");
      return;
    }
    const n = Number(score);
    if (!Number.isFinite(n) || isNaN(n)) {
      alert("Enter a valid number");
      return;
    }
    if (n < 0) {
      alert("Score must be zero or positive");
      return;
    }
    setSubmitting(true);
    try {
      await submitScore(n);
      setScore("");
      await load();
    } catch (err) {
      console.error("Submit failed", err);
      alert("Failed to submit score");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return items;
    return items.filter((it) => {
      const name = String(it?.name || "").toLowerCase();
      const userId = String(it?.userId || "").toLowerCase();
      return name.includes(text) || userId.includes(text);
    });
  }, [items, query]);

  const currentUserEntry = useMemo(() => {
    if (!currentUser?.id) return null;
    return items.find((it) => String(it.userId || "") === String(currentUser.id)) || null;
  }, [items, currentUser]);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-cyan-400/25 bg-slate-950/95 p-4 text-white shadow-[0_20px_80px_rgba(6,182,212,0.18)] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-wide text-cyan-100 sm:text-xl">Global Leaderboard</h3>
            <p className="text-xs text-cyan-50/70">Best score per user, ranked in real-time.</p>
          </div>
          <button
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">Players</p>
            <p className="text-xl font-bold text-cyan-50">{stats.totalPlayers || 0}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Top Score</p>
            <p className="text-xl font-bold text-white">{stats.topScore || 0}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Avg Score</p>
            <p className="text-xl font-bold text-white">{stats.averageScore || 0}</p>
          </div>
        </div>

        {currentUserEntry && (
          <div className="mb-4 rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-500/20 to-blue-500/15 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.12em] text-cyan-100/80">Your Position</p>
            <p className="mt-1 text-sm text-white">
              {rankLabel(currentUserEntry.rank)} with <span className="font-bold text-cyan-200">{currentUserEntry.score}</span> points
            </p>
          </div>
        )}

        <div className="mb-4 space-y-2">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder={currentUser ? "Enter score to submit" : "Login to submit score"}
              className="ui-control flex-1"
              disabled={!currentUser || submitting}
            />
            <button
              className="min-h-10 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-slate-950"
              disabled={!currentUser || submitting}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => load(true)}
              className="min-h-10 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Refresh
            </button>
          </form>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by player name"
            className="ui-control w-full"
          />
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-2.5">
          {loading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : (
            <div className="space-y-2">
              {visibleItems.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
                  No leaderboard entries found.
                </div>
              )}
              {visibleItems.map((it) => {
                const isCurrentUser = currentUser?.id && String(it.userId || "") === String(currentUser.id);
                return (
                  <div
                    key={it.id}
                    className={`rounded-xl border bg-gradient-to-r px-3 py-3 ${medalTone(it.rank)} ${isCurrentUser ? "ring-1 ring-cyan-300/70" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.11em] text-white/70">{rankLabel(it.rank)}</p>
                        <p className="truncate text-base font-semibold text-white">{it.name || "Anonymous"}</p>
                        <p className="text-xs text-white/55">
                          Updated {new Date(it.updatedAt || it.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/70">Score</p>
                        <p className="text-2xl font-extrabold text-cyan-200">{it.score}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
