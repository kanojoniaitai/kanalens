"use client";

import React, { useState } from "react";

export default function ExportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (type: "vocabulary" | "grammar", format: "markdown" | "json") => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ type, format });
      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kanalens-${type}-export.${format === "markdown" ? "md" : "json"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="terminal-button micro-echo text-indigo"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export
      </button>

      {isOpen && (
        <div className="window-frame absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden">
          <div className="bg-panel-strong px-3 py-2 panel-title">
            Vocabulary
          </div>
          <button
            onClick={() => handleExport("vocabulary", "markdown")}
            className="block w-full px-3 py-2 text-left text-xs font-mono uppercase tracking-[0.08em] text-sumi micro-echo hover:bg-panel-strong"
          >
            Markdown (.md)
          </button>
          <button
            onClick={() => handleExport("vocabulary", "json")}
            className="block w-full px-3 py-2 text-left text-xs font-mono uppercase tracking-[0.08em] text-sumi micro-echo hover:bg-panel-strong"
          >
            JSON (.json)
          </button>
          <div className="bg-panel-strong px-3 py-2 panel-title">
            Grammar
          </div>
          <button
            onClick={() => handleExport("grammar", "markdown")}
            className="block w-full px-3 py-2 text-left text-xs font-mono uppercase tracking-[0.08em] text-sumi micro-echo hover:bg-panel-strong"
          >
            Markdown (.md)
          </button>
          <button
            onClick={() => handleExport("grammar", "json")}
            className="block w-full px-3 py-2 text-left text-xs font-mono uppercase tracking-[0.08em] text-sumi micro-echo hover:bg-panel-strong"
          >
            JSON (.json)
          </button>
        </div>
      )}
    </div>
  );
}
