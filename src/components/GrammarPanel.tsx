"use client";

import React from "react";
import type { GrammarSave } from "@/lib/types";

interface GrammarPanelProps {
  grammarList: GrammarSave[];
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function GrammarPanel({ grammarList, onDelete, onClose }: GrammarPanelProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Grammar points archive">
      <div className="window-frame vestige-card flex max-h-[70vh] w-full max-w-3xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="document">
        <div className="window-titlebar">
          <div>
            <div className="panel-title">Grammar archive</div>
            <h3 id="grammar-heading" className="breathing-text mt-1 text-lg font-semibold text-sumi">
              Grammar ({grammarList.length})
            </h3>
          </div>
          <button onClick={onClose} className="terminal-button micro-echo btn-press px-3 py-1" aria-label="Close grammar panel">Close</button>
        </div>

        <div className="window-content flex-1 overflow-y-auto">
          {grammarList.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-secondary">
              No grammar points saved. Add from the Grammar tab.
            </p>
          )}
          {grammarList.map((g) => (
            <div
              key={g.id}
              className="grid grid-cols-[minmax(120px,150px)_1fr_auto] items-start gap-3 px-4 py-3"
            >
              <span className="text-sm font-mono uppercase tracking-[0.05em] text-indigo">
                {g.pattern}
              </span>
              <span className="text-xs leading-relaxed text-secondary">
                {g.explanation_en}
              </span>
              <button
                onClick={() => onDelete(g.id)}
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
