"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vocabulary } from "@/lib/types";

interface TransJapPassageResult {
  id: string;
  title_ja: string;
  title_en: string;
  source_title: string | null;
  source_locator: string | null;
  created_at: string;
  preview: string;
  metadata: {
    corpusId: number | null;
    pack: number | null;
    theme: string;
    level: string;
    targetWords: string[];
    learnerTrap: string;
    practicePrompt: string;
  };
}

export interface TransJapDictionaryEntry {
  id: string;
  expression: string;
  reading: string;
  meaning: string;
  source: string;
}

interface TransJapLibrarySummary {
  passages_total: number;
  passages_filtered: number;
  dictionary_total: number;
  packs: number[];
  levels: string[];
}

interface TransJapLibraryResponse {
  summary: TransJapLibrarySummary;
  passages: TransJapPassageResult[];
  dictionary: TransJapDictionaryEntry[];
}

interface TransJapLibraryPanelProps {
  vocabulary: Vocabulary[];
  initialQuery?: string;
  onOpenPassage: (id: string) => void;
  onSaveDictionaryEntry: (entry: TransJapDictionaryEntry) => Promise<void>;
  onClose: () => void;
}

type LibraryTab = "passages" | "dictionary";

export default function TransJapLibraryPanel({ vocabulary, initialQuery = "", onOpenPassage, onSaveDictionaryEntry, onClose }: TransJapLibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("passages");
  const [query, setQuery] = useState(initialQuery);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [data, setData] = useState<TransJapLibraryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const savedVocabularyWords = useMemo(
    () => new Set(vocabulary.map((item) => item.word)),
    [vocabulary],
  );

  const fetchLibrary = useCallback(async (nextQuery: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        passage_limit: "40",
        dictionary_limit: "40",
      });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (selectedPack) params.set("pack", selectedPack);
      if (selectedLevel) params.set("level", selectedLevel);
      const res = await fetch(`/api/transjap/library?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "TransJap library failed to load");
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setData(payload);
    } catch (err) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setError((err as Error).message);
    } finally {
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [selectedLevel, selectedPack]);

  useEffect(() => {
    const timer = setTimeout(() => fetchLibrary(query), 250);
    return () => clearTimeout(timer);
  }, [fetchLibrary, query]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const handleSaveEntry = async (entry: TransJapDictionaryEntry) => {
    setSavingId(entry.id);
    try {
      await onSaveDictionaryEntry(entry);
    } finally {
      if (isMountedRef.current) setSavingId(null);
    }
  };

  const handleFindPassages = (entry: TransJapDictionaryEntry) => {
    setQuery(entry.expression);
    setActiveTab("passages");
  };

  const summary = data?.summary;
  const passages = data?.passages ?? [];
  const dictionary = data?.dictionary ?? [];
  const hasLoaded = data !== null;
  const summaryPassagesLabel = hasLoaded ? summary?.passages_total ?? 0 : "Loading";
  const summaryDictionaryLabel = hasLoaded ? summary?.dictionary_total ?? 0 : "Loading";
  const summaryVisibleLabel = hasLoaded ? summary?.passages_filtered ?? 0 : "Loading";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="TransJap library">
      <div className="window-frame vestige-card flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden" onClick={(event) => event.stopPropagation()} role="document">
        <div className="window-titlebar">
          <div>
            <div className="panel-title">TransJap Library</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="status-chip text-indigo">{summaryPassagesLabel} passages</span>
              <span className="status-chip text-indigo">{summaryDictionaryLabel} dictionary</span>
              <span className="status-chip">{summaryVisibleLabel} visible</span>
            </div>
          </div>
          <button onClick={onClose} className="terminal-button micro-echo btn-press px-3 py-1" aria-label="Close TransJap library">Close</button>
        </div>

        <div className="window-content space-y-4 border-b border-line px-4 py-4">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_160px_auto]">
            <label className="transjap-filter-field vestige-card flex items-center gap-3 px-3 py-2">
              <span className="panel-title shrink-0">Query</span>
              <input
                type="text"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="word, theme, grammar, passage"
                className="transjap-filter-control min-w-0 flex-1 border-b border-line bg-transparent text-sm text-sumi placeholder:text-muted outline-none"
              />
            </label>
            <label className="transjap-filter-field vestige-card flex items-center gap-2 px-3 py-2">
              <span className="panel-title shrink-0">Pack</span>
              <select
                value={selectedPack}
                onChange={(event) => setSelectedPack(event.target.value)}
                className="transjap-filter-control min-w-0 flex-1 bg-transparent text-sm text-sumi outline-none"
              >
                <option value="">All</option>
                {(summary?.packs ?? []).map((pack) => (
                  <option key={pack} value={pack}>Pack {pack}</option>
                ))}
              </select>
            </label>
            <label className="transjap-filter-field vestige-card flex items-center gap-2 px-3 py-2">
              <span className="panel-title shrink-0">Level</span>
              <select
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(event.target.value)}
                className="transjap-filter-control min-w-0 flex-1 bg-transparent text-sm text-sumi outline-none"
              >
                <option value="">All</option>
                {(summary?.levels ?? []).map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <button onClick={() => fetchLibrary(query)} className="terminal-button terminal-button--primary micro-echo justify-center">
              Refresh
            </button>
          </div>

          <div className="structural-tabs" role="tablist" aria-label="TransJap library sections">
            <button
              onClick={() => setActiveTab("passages")}
              className={`structural-tab ${activeTab === "passages" ? "is-active" : ""}`}
              role="tab"
              aria-selected={activeTab === "passages"}
            >
              Passages <span className="structural-tab-count">{hasLoaded ? passages.length : "..."}</span>
            </button>
            <button
              onClick={() => setActiveTab("dictionary")}
              className={`structural-tab ${activeTab === "dictionary" ? "is-active" : ""}`}
              role="tab"
              aria-selected={activeTab === "dictionary"}
            >
              Dictionary <span className="structural-tab-count">{hasLoaded ? dictionary.length : "..."}</span>
            </button>
          </div>
        </div>

        <div className="window-content flex-1 overflow-y-auto">
          {(loading || (!hasLoaded && !error)) && (
            <div className="px-6 py-10 text-center text-xs font-mono uppercase tracking-[0.08em] text-secondary">Loading TransJap</div>
          )}

          {!loading && error && (
            <div className="px-6 py-10 text-center text-sm text-rose">{error}</div>
          )}

          {hasLoaded && !loading && !error && activeTab === "passages" && (
            <div className="grid gap-0">
              {passages.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-secondary">No TransJap passages matched.</div>
              )}
              {passages.map((passage) => (
                <article key={passage.id} className="grid gap-3 border-t border-line px-4 py-4 first:border-t-0 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {typeof passage.metadata.pack === "number" && <span className="status-chip">Pack {passage.metadata.pack}</span>}
                      {typeof passage.metadata.corpusId === "number" && <span className="status-chip">Item {passage.metadata.corpusId}</span>}
                      {passage.metadata.level && <span className="status-chip text-indigo">{passage.metadata.level}</span>}
                    </div>
                    <h3 className="mt-3 text-lg font-serif text-sumi">{passage.title_ja}</h3>
                    <div className="mt-1 text-xs text-secondary">{passage.title_en}</div>
                    {passage.metadata.theme && (
                      <div className="mt-3 text-sm leading-relaxed text-sumi">{passage.metadata.theme}</div>
                    )}
                    {passage.preview && (
                      <p className="mt-3 font-serif text-[17px] leading-[1.8] text-secondary">{passage.preview}</p>
                    )}
                    {passage.metadata.targetWords.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {passage.metadata.targetWords.slice(0, 8).map((word) => (
                          <span key={word} className="status-chip text-indigo">{word}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start md:justify-end">
                    <button
                      onClick={() => {
                        onOpenPassage(passage.id);
                        onClose();
                      }}
                      className="terminal-button terminal-button--primary micro-echo"
                    >
                      Open
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {hasLoaded && !loading && !error && activeTab === "dictionary" && (
            <div className="grid gap-0">
              {dictionary.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-secondary">No dictionary entries matched.</div>
              )}
              {dictionary.map((entry) => {
                const saved = savedVocabularyWords.has(entry.expression);
                return (
                  <div key={entry.id} className="grid gap-3 border-t border-line px-4 py-4 first:border-t-0 md:grid-cols-[160px_130px_1fr_auto]">
                    <div className="font-serif text-lg text-sumi">{entry.expression}</div>
                    <div className="text-[11px] font-mono text-muted">{entry.reading}</div>
                    <div className="text-sm leading-relaxed text-secondary">{entry.meaning}</div>
                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <button
                        onClick={() => handleFindPassages(entry)}
                        className="terminal-button micro-echo px-3 py-1"
                      >
                        Find texts
                      </button>
                      <button
                        onClick={() => handleSaveEntry(entry)}
                        disabled={saved || savingId !== null}
                        className="terminal-button terminal-button--primary micro-echo px-3 py-1 disabled:opacity-40"
                      >
                        {saved ? "Saved" : savingId === entry.id ? "Saving" : "Save word"}
                      </button>
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
}
