"use client";

import React, { useEffect, useState } from "react";
import GlassCard from "./GlassCard";

interface DailyStat {
  id: string;
  date: string;
  passages_read: number;
  words_learned: number;
  time_spent_ms: number;
}

interface Totals {
  passages: number;
  vocabulary: number;
  grammar: number;
  dueReviews: number;
  streak: number;
}

interface StatsPanelProps {
  onClose: () => void;
}

export default function StatsPanel({ onClose }: StatsPanelProps) {
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [totals, setTotals] = useState<Totals>({
    passages: 0,
    vocabulary: 0,
    grammar: 0,
    dueReviews: 0,
    streak: 0,
  });
  const [range, setRange] = useState<"7" | "30">("7");

  useEffect(() => {
    fetch(`/api/reading-stats?range=${range}`)
      .then((res) => res.json())
      .then((data) => {
        setDailyStats(data.dailyStats || []);
        setTotals(data.totals || { passages: 0, vocabulary: 0, grammar: 0, dueReviews: 0, streak: 0 });
      })
      .catch(console.error);
  }, [range]);

  const maxRead = Math.max(...dailyStats.map((s) => s.passages_read), 1);
  const totalTimeMin = dailyStats.reduce((acc, s) => acc + (s.time_spent_ms || 0), 0) / 60000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={onClose}>
      <div className="window-frame vestige-card flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="window-titlebar">
          <div>
            <div className="panel-title">Reading metrics</div>
            <h3 className="mt-1 text-lg font-semibold text-sumi breathing-text">Reading Stats</h3>
          </div>
          <button onClick={onClose} className="terminal-button micro-echo px-3 py-1">Close</button>
        </div>

        <div className="window-content flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Passages", value: totals.passages },
              { label: "Vocabulary", value: totals.vocabulary },
              { label: "Grammar", value: totals.grammar },
              { label: "Streak", value: `${totals.streak}d` },
            ].map(({ label, value }) => (
              <GlassCard key={label} className="vestige-card-raised p-4 text-center">
                <div className="panel-title mb-2">{label}</div>
                <div className="text-3xl font-semibold text-indigo">{value}</div>
              </GlassCard>
            ))}
          </div>

          {totals.dueReviews > 0 && (
            <div className="vestige-card-inset px-4 py-3 text-sm text-sumi">
              <span className="panel-title mr-3 text-rose">Review queue</span>
              {totals.dueReviews} vocabulary {totals.dueReviews === 1 ? "item" : "items"} due for review
            </div>
          )}

          {totals.dueReviews === 0 && dailyStats.length === 0 && (
            <div className="vestige-card-inset px-4 py-4 text-sm text-secondary">
              Your study dashboard is empty. Generate a passage, save vocabulary, and your reading stats will appear here.
            </div>
          )}

          <div className="space-y-3 vestige-card-raised p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-sumi breathing-text">Activity</h4>
              <div className="flex gap-2">
                {(["7", "30"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`terminal-button micro-echo px-3 py-1 ${range === r ? "terminal-button--primary" : ""}`}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-36 items-end gap-2 border border-softline bg-panel p-3">
              {dailyStats.map((stat) => (
                <div
                  key={stat.date}
                  className="flex flex-1 flex-col items-center gap-2"
                  title={`${stat.date}: ${stat.passages_read} passages, ${Math.round((stat.time_spent_ms || 0) / 60000)}min`}
                >
                  <div className="relative flex w-full flex-1 items-end border border-softline bg-panel-strong">
                    <div
                      className="w-full bg-sumi"
                      style={{ height: `${Math.max((stat.passages_read / maxRead) * 100, 3)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted">{stat.date.slice(8)}</span>
                </div>
              ))}
              {dailyStats.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-xs font-mono uppercase tracking-[0.08em] text-secondary">
                  No activity yet
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="vestige-card-raised p-4 text-center">
              <div className="panel-title mb-2">Total time</div>
              <div className="text-2xl font-semibold text-indigo">
                {totalTimeMin < 60
                  ? `${Math.round(totalTimeMin)}m`
                  : `${Math.floor(totalTimeMin / 60)}h ${Math.round(totalTimeMin % 60)}m`}
              </div>
            </GlassCard>
            <GlassCard className="vestige-card-raised p-4 text-center">
              <div className="panel-title mb-2">Avg / day</div>
              <div className="text-2xl font-semibold text-indigo">
                {dailyStats.length > 0
                  ? (dailyStats.reduce((a, s) => a + s.passages_read, 0) / dailyStats.length).toFixed(1)
                  : "0"}
                <span className="ml-2 text-xs font-mono uppercase tracking-[0.08em] text-secondary">passages</span>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
