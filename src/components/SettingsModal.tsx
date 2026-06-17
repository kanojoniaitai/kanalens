"use client";

import React, { useMemo, useState } from "react";
import type { StyleTemplate } from "@/lib/types";

type MaybePromise<T> = T | Promise<T>;

interface SettingsModalProps {
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  styleTemplates: StyleTemplate[];
  selectedStyleTemplateId: string | null;
  defaultStyleTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onSetDefaultTemplate: (id: string) => void;
  onCreateTemplate: (name: string, prompt: string) => MaybePromise<void>;
  onDuplicateTemplate: (template: StyleTemplate) => MaybePromise<void>;
  onUpdateTemplate: (id: string, name: string, prompt: string) => MaybePromise<void>;
  onDeleteTemplate: (id: string) => MaybePromise<void>;
  onClose: () => void;
}

export default function SettingsModal({
  apiKey,
  onSaveApiKey,
  styleTemplates,
  selectedStyleTemplateId,
  defaultStyleTemplateId,
  onSelectTemplate,
  onSetDefaultTemplate,
  onCreateTemplate,
  onDuplicateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onClose,
}: SettingsModalProps) {
  const [key, setKey] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [activeSection, setActiveSection] = useState<"api" | "modes" | "create">("api");
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const customTemplateCount = useMemo(
    () => styleTemplates.filter((template) => !template.is_default).length,
    [styleTemplates]
  );

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepseek_api_key: key }),
      });
      const data = await res.json();
      setTestResult(res.ok && data.ok ? "success" : "error");
      setFeedback(res.ok && data.ok ? "Connection verified." : data.error || "Unable to validate this API key.");
    } catch {
      setTestResult("error");
      setFeedback("Unable to reach the validation endpoint.");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveKey = () => {
    onSaveApiKey(key.trim());
    setFeedback(key.trim() ? "API key saved locally on this device." : "Saved an empty API key.");
  };

  const handleCreate = async () => {
    if (newName.trim() && newPrompt.trim()) {
      await onCreateTemplate(newName.trim(), newPrompt.trim());
      setNewName("");
      setNewPrompt("");
      setActiveSection("modes");
    }
  };

  const handleStartEdit = (template: StyleTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditPrompt(template.prompt);
  };

  const handleSaveEdit = async () => {
    if (editingId && editName.trim() && editPrompt.trim()) {
      await onUpdateTemplate(editingId, editName.trim(), editPrompt.trim());
      setEditingId(null);
    }
  };

  const navItems = [
    { id: "api" as const, label: "API", value: key.trim() ? "SET" : "EMPTY" },
    { id: "modes" as const, label: "MODES", value: String(styleTemplates.length).padStart(2, "0") },
    { id: "create" as const, label: "CREATE", value: String(customTemplateCount).padStart(2, "0") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center vestige-overlay backdrop-blur-[6px] px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="System settings">
      <div className="window-frame settings-window max-h-[85vh] w-full max-w-5xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="document">
        <div className="window-titlebar">
          <div>
            <div className="panel-title">System settings</div>
            <h3 id="settings-heading" className="breathing-text mt-1 text-lg font-semibold text-sumi">Settings</h3>
          </div>
          <button onClick={onClose} className="terminal-button btn-press micro-echo px-3 py-1" aria-label="Close settings">Close</button>
        </div>

        <div className="window-content settings-content">
          <aside className="settings-sidebar" aria-label="Settings sections">
            <div className="panel-title">Panel</div>
            <div className="settings-sidebar-nav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`settings-sidebar-item micro-echo ${activeSection === item.id ? "is-active" : ""}`}
                  aria-current={activeSection === item.id ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </button>
              ))}
            </div>
          </aside>

          <div className="settings-panel">
            {activeSection === "api" && (
              <section className="vestige-card space-y-3 p-4" aria-labelledby="settings-api-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <label id="settings-api-heading" className="panel-title block mb-2">DeepSeek API Key</label>
                    <p className="mb-3 text-xs leading-relaxed text-secondary">
                      KanaLens stores your key in local storage on this device and sends it only to this app&apos;s local API routes.
                    </p>
                  </div>
                  <span className="status-chip">Local only</span>
                </div>
                <div>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-sumi placeholder:text-muted focus:outline-none"
                  />
                </div>
                {testResult === "success" && (
                  <p className="text-xs font-mono uppercase tracking-[0.08em] text-indigo">API key valid</p>
                )}
                {testResult === "error" && (
                  <p className="text-xs font-mono uppercase tracking-[0.08em] text-rose">API key invalid</p>
                )}
                {feedback && (
                  <p className="text-sm text-secondary">{feedback}</p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={handleTest}
                    disabled={!key || testing}
                    className="terminal-button micro-echo disabled:opacity-40"
                  >
                    {testing ? "Testing" : "Test key"}
                  </button>
                  <button
                    onClick={handleSaveKey}
                    className="terminal-button terminal-button--primary micro-echo"
                  >
                    Save
                  </button>
                </div>
              </section>
            )}

            {activeSection === "modes" && (
              <section className="space-y-4" aria-labelledby="settings-modes-heading">
                <div>
                  <div className="breathing-text panel-title">Style templates</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h4 id="settings-modes-heading" className="text-sm font-semibold text-sumi">Template library</h4>
                    <span className="status-chip">{styleTemplates.length} total</span>
                    <span className="status-chip">{customTemplateCount} custom</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {styleTemplates.map((template) => {
                    const isActive = selectedStyleTemplateId === template.id;
                    const isStartup = defaultStyleTemplateId === template.id;

                    return (
                    <div
                      key={template.id}
                      className={`vestige-card-raised mode-card p-4 ${isActive ? "is-active" : ""}`}
                    >
                      {editingId === template.id ? (
                        <div className="space-y-3">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-sumi focus:outline-none"
                          />
                          <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            rows={4}
                            className="w-full resize-none border-b border-line bg-transparent px-3 py-2 text-xs text-sumi focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              className="terminal-button micro-echo"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="terminal-button terminal-button--primary micro-echo"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-sumi">{template.name}</span>
                                {isActive && <span className="status-chip status-chip--active">Active</span>}
                                {isStartup && <span className="status-chip status-chip--startup">Startup</span>}
                                {template.is_default && <span className="status-chip">Default</span>}
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-secondary">
                                {template.prompt}
                              </p>
                            </div>
                            <div className="mode-card-actions">
                              <button
                                onClick={() => onSelectTemplate(template.id)}
                                disabled={isActive}
                                className={`mode-card-action micro-echo ${isActive ? "is-active" : ""}`}
                              >
                                {isActive ? "Active" : "Use"}
                              </button>
                              <button
                                onClick={() => onSetDefaultTemplate(template.id)}
                                disabled={isStartup}
                                className={`mode-card-action micro-echo ${isStartup ? "is-active" : ""}`}
                              >
                                {isStartup ? "Startup" : "Set startup"}
                              </button>
                              <button
                                onClick={() => onDuplicateTemplate(template)}
                                className="mode-card-action micro-echo"
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => handleStartEdit(template)}
                                className="mode-card-action micro-echo"
                              >
                                Edit
                              </button>
                              {!template.is_default && (
                                <button
                                  onClick={() => onDeleteTemplate(template.id)}
                                  className="mode-card-action mode-card-action--danger micro-echo"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeSection === "create" && (
              <section className="vestige-card-inset p-4 space-y-3" aria-labelledby="settings-create-heading">
                <div id="settings-create-heading" className="panel-title">Create template</div>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Template name"
                  className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-sumi placeholder:text-muted focus:outline-none"
                />
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Prompt content"
                  rows={8}
                  className="w-full resize-none border-b border-line bg-transparent px-3 py-2 text-xs text-sumi placeholder:text-muted focus:outline-none"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newPrompt.trim()}
                  className="terminal-button terminal-button--primary micro-echo disabled:opacity-40"
                >
                  Create template
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
