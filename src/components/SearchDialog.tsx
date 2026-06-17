"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
  passages: {
    id: string;
    title_ja: string;
    title_en: string;
    source_title: string | null;
    source_locator: string | null;
    match_hint: string;
    type: string;
  }[];
  vocabularies: { id: string; word: string; reading: string; gloss_en: string; type: string }[];
  dictionary: { id: string; expression: string; reading: string; meaning: string; source: string; type: string }[];
  grammars: { id: string; pattern: string; explanation_en: string; type: string }[];
}

const MIN_QUERY_LENGTH = 2;

interface SearchDialogProps {
  onSelectPassage: (id: string) => void;
  onClose: () => void;
}

export default function SearchDialog({ onSelectPassage, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < MIN_QUERY_LENGTH) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const hasResults = results && (
    results.passages.length > 0 || results.vocabularies.length > 0 || results.dictionary.length > 0 || results.grammars.length > 0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center vestige-overlay backdrop-blur-[6px] px-4 pt-[10vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search passages, vocabulary, and grammar">
      <div
        className="window-frame w-full max-w-3xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="search"
      >
        <div className="window-titlebar">
          <div>
            <div className="panel-title">Search console</div>
            <div className="mt-1 text-xs font-mono uppercase tracking-[0.08em] text-secondary">
              passages / vocabulary / grammar
            </div>
          </div>
          <kbd className="command-key">ESC</kbd>
        </div>

        <div className="window-content px-4 py-3">
          <div className="vestige-card flex items-center gap-3 px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-secondary" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Search passages, vocabulary, grammar..."
              className="flex-1 border-b border-line bg-transparent text-sm text-sumi placeholder:text-muted outline-none"
              aria-label="Search query"
            />
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs font-mono uppercase tracking-[0.08em] text-secondary">Searching</div>
          )}

          {!loading && query.length >= MIN_QUERY_LENGTH && !hasResults && (
            <div className="px-4 py-8 text-center text-xs font-mono uppercase tracking-[0.08em] text-rose">No results found</div>
          )}

          {!loading && results && results.passages.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 py-1 panel-title">Passages</div>
              {results.passages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelectPassage(p.id); onClose(); }}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 border-t border-line px-3 py-3 text-left first:border-t-0 hover:bg-panel-strong micro-echo"
                >
                  <div>
                    <div className="text-sm font-medium text-sumi">{p.title_ja}</div>
                    <div className="text-xs text-secondary">{p.title_en}</div>
                    {(p.source_title || p.source_locator || p.match_hint) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.source_title && <span className="status-chip">{p.source_title}</span>}
                        {p.source_locator && <span className="status-chip">{p.source_locator}</span>}
                        {p.match_hint && <span className="status-chip text-indigo">match: {p.match_hint}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-indigo">Open</span>
                </button>
              ))}
            </div>
          )}

          {!loading && results && results.vocabularies.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 py-1 panel-title">Vocabulary</div>
              {results.vocabularies.map((v) => (
                <div
                  key={v.id}
                  className="grid grid-cols-[120px_120px_1fr] gap-3 border-t border-line px-3 py-3 first:border-t-0"
                >
                  <div className="text-sm font-serif text-sumi">{v.word}</div>
                  <div className="text-[11px] font-mono text-muted">{v.reading}</div>
                  <div className="text-xs text-secondary">{v.gloss_en}</div>
                </div>
              ))}
            </div>
          )}

          {!loading && results && results.dictionary.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 py-1 panel-title">Dictionary</div>
              {results.dictionary.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[120px_120px_1fr] gap-3 border-t border-line px-3 py-3 first:border-t-0"
                >
                  <div className="text-sm font-serif text-sumi">{entry.expression}</div>
                  <div className="text-[11px] font-mono text-muted">{entry.reading}</div>
                  <div>
                    <div className="text-xs text-secondary">{entry.meaning}</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.08em] text-muted">{entry.source}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && results && results.grammars.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 py-1 panel-title">Grammar</div>
              {results.grammars.map((g) => (
                <div
                  key={g.id}
                  className="grid grid-cols-[120px_1fr] gap-3 border-t border-line px-3 py-3 first:border-t-0"
                >
                  <div className="text-sm font-mono uppercase tracking-[0.04em] text-sumi">{g.pattern}</div>
                  <div className="text-xs text-secondary">{g.explanation_en}</div>
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div className="px-4 py-8 text-center text-xs font-mono uppercase tracking-[0.08em] text-secondary">
              Type at least 2 characters to search across passages, vocabulary, and grammar
            </div>
          )}
          {query.length > 0 && query.length < MIN_QUERY_LENGTH && !loading && (
            <div className="px-4 py-8 text-center text-xs font-mono uppercase tracking-[0.08em] text-secondary">
              Type 2 or more characters to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
