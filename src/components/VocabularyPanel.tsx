"use client";

import React, { useMemo } from "react";
import type { Vocabulary } from "@/lib/types";

interface VocabularyPanelProps {
  vocabulary: Vocabulary[];
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatNextReview(value: string | null): string {
  if (!value) return "New";
  return new Date(value).toLocaleDateString();
}

export default function VocabularyPanel({ vocabulary, onDelete, onClose }: VocabularyPanelProps) {
  const summary = useMemo(() => {
    const now = new Date().toISOString();
    const due = vocabulary.filter((item) => item.next_review_at && item.next_review_at <= now).length;
    const learning = vocabulary.filter((item) => item.review_count > 0).length;
    return { due, learning };
  }, [vocabulary]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Vocabulary archive">
      <div className="window-frame vestige-card flex max-h-[70vh] w-full max-w-5xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="document">
        <div className="window-titlebar">
          <div>
            <div className="panel-title">Vocabulary archive</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 id="vocab-heading" className="breathing-text text-lg font-semibold text-sumi">
                Vocabulary ({vocabulary.length})
              </h3>
              <span className="status-chip text-indigo">Due {summary.due}</span>
              <span className="status-chip text-indigo">Reviewed {summary.learning}</span>
            </div>
          </div>
          <button onClick={onClose} className="terminal-button micro-echo btn-press px-3 py-1" aria-label="Close vocabulary panel">Close</button>
        </div>

        <div className="window-content flex-1 overflow-y-auto">
          {vocabulary.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-secondary">
              No vocabulary yet. Add words from Word Gloss.
            </p>
          )}
          {vocabulary.map((v) => (
            <div
              key={v.id}
              className="grid grid-cols-[minmax(100px,120px)_minmax(100px,120px)_90px_minmax(120px,140px)_90px_1fr_auto] items-center gap-3 px-4 py-3"
            >
              <span className="text-sm font-serif text-sumi">{v.word}</span>
              <span className="text-[11px] font-mono text-muted">{v.reading}</span>
              <span className="vestige-card-raised px-2 py-1 text-center text-[10px] font-mono uppercase tracking-[0.08em] text-secondary">
                {v.pos}
              </span>
              <span className="text-[11px] font-mono text-secondary">
                Next {formatNextReview(v.next_review_at)}
              </span>
              <span className="text-[11px] font-mono text-secondary">
                Reviews {v.review_count}
              </span>
              <span className="text-xs text-secondary leading-relaxed">{v.gloss_en}</span>
              <button
                onClick={() => onDelete(v.id)}
                className="terminal-button micro-echo text-rose px-3 py-1"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
