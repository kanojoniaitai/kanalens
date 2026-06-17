"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { Vocabulary, SRSRating } from "@/lib/types";

interface FlashcardPanelProps {
  vocabulary: Vocabulary[];
  onRate: (id: string, rating: SRSRating) => void;
  onClose: () => void;
}

function formatDueDate(value: string | null): string {
  if (!value) return "New";
  return new Date(value).toLocaleString();
}

export default function FlashcardPanel({ vocabulary, onRate, onClose }: FlashcardPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const dueVocab = useMemo(() => {
    const now = new Date().toISOString();
    const due = vocabulary.filter(
      (v) => v.next_review_at && v.next_review_at <= now
    );
    if (due.length === 0) {
      return vocabulary.filter((v) => !v.next_review_at).slice(0, 10);
    }
    return due;
  }, [vocabulary]);

  const clampedIndex = Math.min(currentIndex, Math.max(dueVocab.length - 1, 0));
  const current = dueVocab[clampedIndex];
  const remainingCount = Math.max(dueVocab.length - clampedIndex, 0);

  const handleRate = useCallback(
    (rating: SRSRating) => {
      if (!current) return;
      onRate(current.id, rating);
      setCompletedCount((count) => count + 1);
      setFlipped(false);
      setTimeout(() => {
        if (clampedIndex < dueVocab.length - 1) {
          setCurrentIndex(clampedIndex + 1);
        } else {
          onClose();
        }
      }, 300);
    },
    [clampedIndex, current, dueVocab.length, onClose, onRate]
  );

  const handleClose = useCallback(() => {
    setCurrentIndex(0);
    setFlipped(false);
    setCompletedCount(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (flipped) {
        if (e.key === "1") handleRate(1);
        if (e.key === "2") handleRate(2);
        if (e.key === "3") handleRate(3);
        if (e.key === "4") handleRate(4);
        if (e.key === "5") handleRate(5);
      }
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [flipped, handleClose, handleRate]);

  if (!current) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={handleClose}>
        <div className="window-frame vestige-card w-full max-w-lg p-10 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="panel-title mb-6">Review queue</div>
          <h3 className="display-bold text-[32px] text-sumi breathing-text mb-3">All caught up</h3>
          <p className="editorial-mono text-[14px] text-secondary leading-[1.7] mb-2">
            No vocabulary due for review right now.
          </p>
          {completedCount > 0 && (
            <p className="micro-mono-soft mb-8">
              Reviewed {completedCount} {completedCount === 1 ? "card" : "cards"} this session
            </p>
          )}
          <button onClick={handleClose} className="terminal-button terminal-button--primary micro-echo mx-auto">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={handleClose}>
      <div className="w-full max-w-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="window-frame vestige-card flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="status-chip text-indigo">Card {clampedIndex + 1} / {dueVocab.length}</span>
            <span className="status-chip">Remaining {remainingCount}</span>
            <span className="status-chip text-indigo">Reviewed {completedCount}</span>
          </div>
          <button onClick={handleClose} className="terminal-button micro-echo px-3 py-1">Close</button>
        </div>

        <div
          onClick={() => setFlipped(!flipped)}
          className="window-frame vestige-card-interactive min-h-[360px] cursor-pointer select-none micro-echo p-10 flex flex-col items-center justify-center text-center"
        >
          {!flipped ? (
            <div>
              <div className="panel-title mb-6">Front</div>
              <p className="display-bold text-[48px] text-sumi breathing-text mb-3">{current.word}</p>
              <p className="editorial-mono text-[16px] text-secondary">{current.reading}</p>
              <p className="mt-8 micro-mono-soft">
                Next due {formatDueDate(current.next_review_at)}
              </p>
            </div>
          ) : (
            <div className="w-full max-w-xl">
              <div className="panel-title mb-6">Back</div>
              <p className="display-bold text-[48px] text-sumi breathing-text mb-2">{current.word}</p>
              <p className="editorial-mono text-[16px] text-secondary mb-8">{current.reading}</p>
              <div className="panel-divider mb-8" />
              <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-block border border-softline bg-panel-strong px-3 py-1 text-[10px] font-mono uppercase tracking-[0.08em] text-secondary">
                  {current.pos}
                </span>
                <span className="status-chip">Reviews {current.review_count}</span>
              </div>
              <p className="editorial-mono text-[16px] text-sumi leading-[1.7]">{current.gloss_en}</p>
            </div>
          )}

          {!flipped && (
            <p className="mt-10 micro-mono-soft">
              Click or press Space to flip
            </p>
          )}
        </div>

        {flipped && (
          <div className="window-frame vestige-card p-4 space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {[
                { rating: 1 as SRSRating, label: "Again" },
                { rating: 2 as SRSRating, label: "Hard" },
                { rating: 3 as SRSRating, label: "OK" },
                { rating: 4 as SRSRating, label: "Good" },
                { rating: 5 as SRSRating, label: "Easy" },
              ].map(({ rating, label }) => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  className={`terminal-button micro-echo justify-center${rating === 1 ? " text-rose" : ""}`}
                >
                  {label}
                  <span className="command-key">{rating}</span>
                </button>
              ))}
            </div>
            <p className="text-center micro-mono-soft">
              Use keys 1-5 to rate recall speed and accuracy
            </p>
          </div>
        )}

        <div className="window-frame vestige-card overflow-hidden">
          <div
            className="h-2 bg-sumi transition-all duration-300"
            style={{ width: `${((clampedIndex + 1) / dueVocab.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
