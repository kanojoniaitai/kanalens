"use client";

import React, { useEffect } from "react";

interface ShortcutsPanelProps {
  onClose: () => void;
}

export default function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const shortcuts = [
    {
      category: "Navigation",
      items: [
        { key: "←", description: "Previous passage" },
        { key: "→", description: "Next passage" },
        { key: "Tab", description: "Navigate between elements" },
        { key: "Shift + Tab", description: "Navigate backwards" },
      ],
    },
    {
      category: "Actions",
      items: [
        { key: "Ctrl/Cmd + Enter", description: "Generate new passage" },
        { key: "Ctrl/Cmd + K", description: "Open search" },
        { key: "?", description: "Show this shortcuts panel" },
        { key: "Escape", description: "Close modal or panel" },
      ],
    },
    {
      category: "Workspace",
      items: [
        { key: "1", description: "单词 column" },
        { key: "2", description: "语法 column" },
        { key: "4", description: "Open vocabulary review cards" },
        { key: "5", description: "Open corpus browser" },
      ],
    },
    {
      category: "Accessibility",
      items: [
        { key: "Tab (initial)", description: "Skip to main content" },
        { key: "Space", description: "Activate button or toggle" },
        { key: "Enter", description: "Activate link or button" },
        { key: "Arrow keys", description: "Navigate within lists" },
      ],
    },
  ];

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div 
        className="window-frame shortcuts-panel" 
        onClick={(e) => e.stopPropagation()}
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="shortcuts-title"
      >
        <div className="window-titlebar">
          <div>
            <div className="panel-title">Keyboard shortcuts</div>
            <h3 id="shortcuts-title" className="breathing-text mt-1 text-lg font-semibold text-sumi">
              Shortcuts
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="terminal-button micro-echo btn-press px-3 py-1"
            aria-label="Close shortcuts panel"
          >
            Close
          </button>
        </div>

        <div className="window-content p-6 space-y-8">
          {shortcuts.map((category) => (
            <div key={category.category} className="space-y-4">
              <h4 className="panel-title">{category.category}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {category.items.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="vestige-card p-4 grid grid-cols-[auto_1fr] items-center gap-4"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {item.key.split(" + ").map((keyPart, i) => (
                        <kbd key={i} className="tabular-mono">
                          {keyPart}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-sm text-secondary">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="vestige-card-raised p-4">
            <div className="micro-mono-soft mb-2">Accessibility note</div>
            <p className="text-sm text-secondary leading-relaxed">
              All interactive elements support keyboard navigation. Use <kbd>Tab</kbd> to navigate, 
              <kbd>Enter</kbd> or <kbd>Space</kbd> to activate. Focus indicators are clearly visible 
              for users with visual impairments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
