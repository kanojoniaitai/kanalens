"use client";

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { GrammarPoint, Passage, PassageSummary, SRSRating, StyleTemplate, WordGloss } from "@/lib/types";
import SettingsModal from "@/components/SettingsModal";
import FlashcardPanel from "@/components/FlashcardPanel";
import StatsPanel from "@/components/StatsPanel";
import SearchDialog from "@/components/SearchDialog";
import ThreadConnect from "@/components/ThreadConnect";
import ShortcutsPanel from "@/components/ShortcutsPanel";
import Toast, { type ToastItem } from "@/components/Toast";
import TransJapLibraryPanel, { type TransJapDictionaryEntry } from "@/components/TransJapLibraryPanel";
import RetroPortalWorkspace, { type RetroStudyTab } from "@/components/RetroPortalWorkspace";

const DEFAULT_STYLE_TEMPLATE_STORAGE_KEY = "kanalens_default_style_template_id";

export default function Home() {
  const {
  currentPassage,
  isLoading,
  isHydrated,
  error,
  apiKey,
  vocabulary,
  grammarList,
  styleTemplates,
  selectedStyleTemplateId,
  passageHistory,
  currentPassageIndex,
  readPassageIds,
  passageStartTime,
  analysisStateByPassageId,
  showFlashcards,
  showStats,
  setHydrated,
  setCurrentPassage,
  setIsLoading,
  setError,
  setApiKey,
  setVocabulary,
  addVocabulary,
  updateVocabulary,
  removeVocabulary,
  setGrammarList,
  addGrammar,
  removeGrammar,
  setStyleTemplates,
  setSelectedStyleTemplateId,
  setPassageHistory,
  addPassageToHistory,
  generationStatus,
  generationStage,
  generationProgress,
  generationPreview,
  generationAttempt,
  setGenerationStatus,
  setGenerationStage,
  setGenerationProgress,
  appendGenerationPreview,
  setGenerationAttempt,
  resetGeneration,
  markPassageAsRead,
  setShowFlashcards,
  setShowStats,
  setAnalysisActiveTab,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showTransJapLibrary, setShowTransJapLibrary] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [transJapLibraryQuery, setTransJapLibraryQuery] = useState("");
  const [isGeneratingJIC, setIsGeneratingJIC] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dueReviews, setDueReviews] = useState(0);
  const [defaultStyleTemplateId, setDefaultStyleTemplateId] = useState<string | null>(() => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEFAULT_STYLE_TEMPLATE_STORAGE_KEY);
  });
  const generatingRef = useRef(false);

  const effectiveDefaultStyleTemplateId = useMemo(() => {
  if (styleTemplates.length === 0) return null;
  if (defaultStyleTemplateId && styleTemplates.some((template) => template.id === defaultStyleTemplateId)) {
  return defaultStyleTemplateId;
  }
  return styleTemplates[0].id;
  }, [styleTemplates, defaultStyleTemplateId]);

  useEffect(() => {
  const saved = localStorage.getItem("kanalens_api_key");
  if (saved) setApiKey(saved);
  setHydrated(true);
  }, [setApiKey, setHydrated]);

  useEffect(() => {
  fetch("/api/style-template")
  .then((res) => res.json())
  .then((data) => {
  if (data.templates) setStyleTemplates(data.templates);
  })
  .catch(console.error);
  }, [setStyleTemplates]);

  useEffect(() => {
  if (styleTemplates.length === 0) {
  if (selectedStyleTemplateId) setSelectedStyleTemplateId(null);
  return;
  }

  if (effectiveDefaultStyleTemplateId) {
  localStorage.setItem(DEFAULT_STYLE_TEMPLATE_STORAGE_KEY, effectiveDefaultStyleTemplateId);
  }

  const selectedExists = selectedStyleTemplateId
  ? styleTemplates.some((template) => template.id === selectedStyleTemplateId)
  : false;
  if (!selectedExists && effectiveDefaultStyleTemplateId) {
  setSelectedStyleTemplateId(effectiveDefaultStyleTemplateId);
  }
  }, [styleTemplates, effectiveDefaultStyleTemplateId, selectedStyleTemplateId, setSelectedStyleTemplateId]);

  useEffect(() => {
  fetch("/api/vocabulary?limit=5000")
  .then((res) => res.json())
  .then((data) => {
  if (data.vocabularies) setVocabulary(data.vocabularies);
  })
  .catch(console.error);
  }, [setVocabulary]);

  useEffect(() => {
  fetch("/api/grammar")
  .then((res) => res.json())
  .then((data) => {
  if (data.grammars) setGrammarList(data.grammars);
  })
  .catch(console.error);
  }, [setGrammarList]);

  useEffect(() => {
  const savedIds = localStorage.getItem("kanalens_read_ids");
  if (savedIds) {
  try {
  const ids: string[] = JSON.parse(savedIds);
  ids.forEach((id) => markPassageAsRead(id));
  } catch { }
  }
  }, [markPassageAsRead]);

  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
  const timers = toastTimersRef.current;
  return () => {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  };
  }, []);

  useEffect(() => {
  let cancelled = false;
  const loadDue = () => {
  fetch("/api/reading-stats?range=7")
  .then((res) => res.json())
  .then((data) => {
  if (!cancelled) setDueReviews(Number(data?.totals?.dueReviews ?? 0));
  })
  .catch(() => { });
  };
  loadDue();
  const onMistake = () => loadDue();
  window.addEventListener("kanalens:mistake-recorded", onMistake);
  return () => {
  cancelled = true;
  window.removeEventListener("kanalens:mistake-recorded", onMistake);
  };
  }, [vocabulary.length]);

  const addToast = useCallback((type: ToastItem["type"], message: string) => {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
  const timer = setTimeout(() => {
  setToasts((prev) => prev.filter((t) => t.id !== id));
  toastTimersRef.current.delete(id);
  }, 300);
  toastTimersRef.current.set(id, timer);
  }, []);

  const reportReadingTime = useCallback(async () => {
  if (!passageStartTime) return;
  const elapsed = Date.now() - passageStartTime;
  if (elapsed > 5000) {
  try {
  await fetch("/api/reading-stats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passages_read: 1, time_spent_ms: elapsed }),
  });
  } catch { }
  }
  }, [passageStartTime]);

  const loadPassageHistory = useCallback(
  async (templateId?: string | null) => {
  try {
  const params = new URLSearchParams({ list: "true" });
  if (templateId) params.set("style_template_id", templateId);
  const res = await fetch(`/api/passage?${params.toString()}`);
  if (res.ok) {
  const data = await res.json();
  const history: PassageSummary[] = data.passages || [];
  setPassageHistory(history);
  return history;
  }
  } catch (err) {
  console.error("Load passage history error:", err);
  }
  return [];
  },
  [setPassageHistory]
  );

  const loadPassageById = useCallback(
  async (id: string) => {
  await reportReadingTime();
  setIsLoading(true);
  setError(null);
  try {
  const res = await fetch(`/api/passage?id=${id}`);
  if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error || "Failed to fetch passage");
  }
  const data = await res.json();
  setCurrentPassage(data.passage);
  } catch (err) {
  const message = (err as Error).message;
  setError(message);
  addToast("error", `Failed to load passage: ${message}`);
  } finally {
  setIsLoading(false);
  }
  },
  [setCurrentPassage, setIsLoading, setError, reportReadingTime, addToast]
  );

  useEffect(() => {
  if (isHydrated) {
  loadPassageHistory(selectedStyleTemplateId).then((history) => {
  if (history.length > 0 && !currentPassage) {
  loadPassageById(history[0].id);
  }
  });
  }
  }, [isHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
  if (!isHydrated) return;
  loadPassageHistory(selectedStyleTemplateId).then((history) => {
  if (history.length > 0) {
  loadPassageById(history[0].id);
  } else {
  setCurrentPassage(null);
  }
  });
  }, [selectedStyleTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveApiKey = useCallback(
  (key: string) => {
  setApiKey(key);
  localStorage.setItem("kanalens_api_key", key);
  addToast("success", "API key saved");
  },
  [setApiKey, addToast]
  );

  const handleSelectStyleTemplate = useCallback(
  (id: string | null) => {
  if (!id) return;
  const template = styleTemplates.find((item) => item.id === id);
  setSelectedStyleTemplateId(id);
  addToast("info", `Mode armed: ${template?.name ?? "custom"}`);
  },
  [styleTemplates, setSelectedStyleTemplateId, addToast]
  );

  const handleSetDefaultStyleTemplate = useCallback(
  (id: string) => {
  const template = styleTemplates.find((item) => item.id === id);
  if (!template) return;
  setDefaultStyleTemplateId(id);
  localStorage.setItem(DEFAULT_STYLE_TEMPLATE_STORAGE_KEY, id);
  if (selectedStyleTemplateId !== id) {
  setSelectedStyleTemplateId(id);
  }
  addToast("success", `Startup mode set: ${template.name}`);
  },
  [styleTemplates, selectedStyleTemplateId, setSelectedStyleTemplateId, addToast]
  );

  const openTransJapLibrary = useCallback((query = "") => {
  setTransJapLibraryQuery(query);
  setShowTransJapLibrary(true);
  }, []);

  const generateNewPassage = useCallback(async () => {
  // 有本地密钥就带上（本地开发用）；没有就不带，让服务端用环境变量
  // DEEPSEEK_API_KEY 兜底，手机端无需输入任何密钥。
  const effectiveKey = apiKey || localStorage.getItem("kanalens_api_key") || "";

  if (generatingRef.current) return;
  generatingRef.current = true;

  resetGeneration();
  setGenerationStatus("generating");
  setError(null);

  try {
  const res = await fetch("/api/passage/generate", {
  method: "POST",
  headers: {
  "Content-Type": "application/json",
  ...(effectiveKey ? { "x-api-key": effectiveKey } : {}),
  },
  body: JSON.stringify({
  style_template_id: selectedStyleTemplateId,
  exclude_ids: readPassageIds,
  generation_tier: "normal",
  }),
  });

  if (!res.ok) {
  throw new Error("Failed to start generation");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
  if (line.startsWith("event: ")) continue;
  if (line.startsWith("data: ")) {
  const dataStr = line.slice(6).trim();
  try {
  const data = JSON.parse(dataStr);

  if (data.stage) {
  setGenerationStage(data.stage);
  const stageProgress: Record<string, number> = {
  connecting: 8,
  cache_hit: 52,
  drafting: 42,
  generating: 42,
  validating: 68,
  repairing: 58,
  retrying: 58,
  saving: 90,
  done: 100,
  };
  setGenerationProgress(stageProgress[data.stage] ?? 0);
  if (data.attempt) setGenerationAttempt(data.attempt);
  }

  if (data.text) {
  appendGenerationPreview(data.text);
  }

  if (data.passage) {
  const passage: Passage = data.passage;
  setCurrentPassage(passage);
  addPassageToHistory({
  id: passage.id,
  title_ja: passage.title_ja,
  style_template_id: passage.style_template_id,
  verification_status: passage.verification_status,
  source_title: passage.source_title,
  source_author: passage.source_author,
  created_at: passage.created_at,
  });
  setGenerationStatus("done");
  addToast("success", "新文章已载入。先读一句，再看它的 JIC，然后存词。");
  }

  if (data.error) {
  setError(data.error);
  setGenerationStatus("error");
  }
  } catch {
  }
  }
  }
  }
  } catch (err) {
  const message = (err as Error).message;
  setError(message);
  setGenerationStatus("error");
  addToast("error", `Generation failed: ${message}`);
  } finally {
  generatingRef.current = false;
  }
  }, [apiKey, selectedStyleTemplateId, readPassageIds, setCurrentPassage, setError, addPassageToHistory, resetGeneration, setGenerationStatus, setGenerationStage, setGenerationProgress, appendGenerationPreview, setGenerationAttempt, addToast]);

  const handlePrev = useCallback(() => {
  if (currentPassageIndex > 0) {
  const prevItem = passageHistory[currentPassageIndex - 1];
  if (prevItem) loadPassageById(prevItem.id);
  }
  }, [currentPassageIndex, passageHistory, loadPassageById]);

  const handleNext = useCallback(() => {
  if (currentPassageIndex < passageHistory.length - 1) {
  const nextItem = passageHistory[currentPassageIndex + 1];
  if (nextItem) loadPassageById(nextItem.id);
  }
  }, [currentPassageIndex, passageHistory, loadPassageById]);

  const handleSelectPassage = useCallback(
  (id: string) => {
  loadPassageById(id);
  },
  [loadPassageById]
  );

  const handleDeletePassage = useCallback(
  async (id: string) => {
  try {
  await fetch(`/api/passage?id=${id}`, { method: "DELETE" });
  const newHistory = passageHistory.filter((p) => p.id !== id);
  setPassageHistory(newHistory);
  if (currentPassage?.id === id) {
  if (newHistory.length > 0) {
  loadPassageById(newHistory[0].id);
  } else {
  setCurrentPassage(null);
  }
  }
  addToast("info", "Passage deleted");
  } catch (err) {
  console.error("Delete passage error:", err);
  addToast("error", `Passage delete failed: ${(err as Error).message}`);
  }
  },
  [passageHistory, currentPassage, setPassageHistory, loadPassageById, setCurrentPassage, addToast]
  );

  const handleAddVocabulary = useCallback(
  async (wg: WordGloss) => {
  try {
  const res = await fetch("/api/vocabulary", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  word: wg.word,
  reading: wg.reading,
  pos: wg.pos,
  gloss_en: wg.gloss_en,
  source_passage_id: currentPassage?.id,
  }),
  });
  if (res.ok) {
  const data = await res.json();
  if (data.updated) {
  updateVocabulary(data.vocabulary.id, data.vocabulary);
  addToast("info", `Word refreshed: ${wg.word}`);
  } else {
  addVocabulary(data.vocabulary);
  addToast("success", `Word saved: ${wg.word}`);
  }
  try {
  await fetch("/api/reading-stats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ words_learned: 1 }),
  });
  } catch { }
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to save vocabulary");
  }
  } catch (err) {
  console.error("Add vocabulary error:", err);
  addToast("error", `Vocabulary save failed: ${(err as Error).message}`);
  }
  },
  [currentPassage, addVocabulary, updateVocabulary, addToast]
  );

  const handleSaveTransJapDictionaryEntry = useCallback(
  async (entry: TransJapDictionaryEntry) => {
  try {
  const res = await fetch("/api/vocabulary", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  word: entry.expression,
  reading: entry.reading,
  pos: "other",
  gloss_en: entry.meaning,
  source_passage_id: null,
  }),
  });
  if (res.ok) {
  const data = await res.json();
  if (data.updated) {
  if (vocabulary.some((item) => item.id === data.vocabulary.id)) {
  updateVocabulary(data.vocabulary.id, data.vocabulary);
  } else {
  addVocabulary(data.vocabulary);
  }
  addToast("info", `Word refreshed: ${entry.expression}`);
  } else {
  addVocabulary(data.vocabulary);
  addToast("success", `Word saved: ${entry.expression}`);
  try {
  await fetch("/api/reading-stats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ words_learned: 1 }),
  });
  } catch { }
  }
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to save dictionary entry");
  }
  } catch (err) {
  console.error("Save TransJap dictionary entry error:", err);
  addToast("error", `Dictionary save failed: ${(err as Error).message}`);
  }
  },
  [vocabulary, addVocabulary, updateVocabulary, addToast]
  );

  const handleRemoveVocabulary = useCallback(
  async (word: string) => {
  const item = vocabulary.find((v) => v.word === word);
  if (!item) return;
  try {
  const res = await fetch(`/api/vocabulary?id=${item.id}`, { method: "DELETE" });
  if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error || "Unable to remove vocabulary");
  }
  removeVocabulary(item.id);
  addToast("info", `Word removed: ${word}`);
  } catch (err) {
  console.error("Remove vocabulary error:", err);
  addToast("error", `Vocabulary remove failed: ${(err as Error).message}`);
  }
  },
  [vocabulary, removeVocabulary, addToast]
  );

  const handleAddGrammar = useCallback(
  async (gp: GrammarPoint) => {
  try {
  const res = await fetch("/api/grammar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  pattern: gp.pattern,
  explanation_en: gp.explanation_en,
  source_passage_id: currentPassage?.id,
  }),
  });
  if (res.ok) {
  const data = await res.json();
  if (!data.updated && !data.duplicate) {
  addGrammar(data.grammar);
  addToast("success", `Grammar saved: ${gp.pattern}`);
  } else {
  addToast("info", `Grammar refreshed: ${gp.pattern}`);
  }
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to save grammar");
  }
  } catch (err) {
  console.error("Add grammar error:", err);
  addToast("error", `Grammar save failed: ${(err as Error).message}`);
  }
  },
  [currentPassage, addGrammar, addToast]
  );

  const handleRemoveGrammar = useCallback(
  async (pattern: string) => {
  const item = grammarList.find((g) => g.pattern === pattern);
  if (!item) return;
  try {
  const res = await fetch(`/api/grammar?id=${item.id}`, { method: "DELETE" });
  if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error || "Unable to remove grammar");
  }
  removeGrammar(item.id);
  addToast("info", `Grammar removed: ${pattern}`);
  } catch (err) {
  console.error("Remove grammar error:", err);
  addToast("error", `Grammar remove failed: ${(err as Error).message}`);
  }
  },
  [grammarList, removeGrammar, addToast]
  );

  const handleCreateTemplate = useCallback(
  async (name: string, prompt: string) => {
  try {
  const res = await fetch("/api/style-template", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, prompt }),
  });
  if (res.ok) {
  const data = await res.json();
  setStyleTemplates([...styleTemplates, data.template]);
  setSelectedStyleTemplateId(data.template.id);
  addToast("success", `Mode created: ${data.template.name}`);
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to create mode");
  }
  } catch (err) {
  console.error("Create template error:", err);
  addToast("error", `Mode create failed: ${(err as Error).message}`);
  }
  },
  [styleTemplates, setStyleTemplates, setSelectedStyleTemplateId, addToast]
  );

  const handleDuplicateTemplate = useCallback(
  async (template: StyleTemplate) => {
  try {
  const res = await fetch("/api/style-template", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  name: `${template.name} copy`,
  prompt: template.prompt,
  }),
  });
  if (res.ok) {
  const data = await res.json();
  setStyleTemplates([...styleTemplates, data.template]);
  setSelectedStyleTemplateId(data.template.id);
  addToast("success", `Mode copied: ${data.template.name}`);
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to copy mode");
  }
  } catch (err) {
  console.error("Duplicate template error:", err);
  addToast("error", `Mode copy failed: ${(err as Error).message}`);
  }
  },
  [styleTemplates, setStyleTemplates, setSelectedStyleTemplateId, addToast]
  );

  const handleUpdateTemplate = useCallback(
  async (id: string, name: string, prompt: string) => {
  try {
  const res = await fetch(`/api/style-template?id=${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, prompt }),
  });
  if (res.ok) {
  const data = await res.json();
  setStyleTemplates(styleTemplates.map((t) => (t.id === id ? data.template : t)));
  addToast("success", `Mode updated: ${data.template.name}`);
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to update mode");
  }
  } catch (err) {
  console.error("Update template error:", err);
  addToast("error", `Mode update failed: ${(err as Error).message}`);
  }
  },
  [styleTemplates, setStyleTemplates, addToast]
  );

  const handleDeleteTemplate = useCallback(
  async (id: string) => {
  const template = styleTemplates.find((t) => t.id === id);
  if (template && !window.confirm(`确认删除模式「${template.name}」吗？`)) return;
  try {
  const res = await fetch(`/api/style-template?id=${id}`, { method: "DELETE" });
  if (res.ok) {
  const deletedTemplate = styleTemplates.find((t) => t.id === id);
  const nextTemplates = styleTemplates.filter((t) => t.id !== id);
  setStyleTemplates(nextTemplates);
  const nextSelectedId = nextTemplates[0]?.id ?? null;
  if (selectedStyleTemplateId === id) {
  setSelectedStyleTemplateId(nextSelectedId);
  }
  if (defaultStyleTemplateId === id) {
  setDefaultStyleTemplateId(nextSelectedId);
  if (nextSelectedId) {
  localStorage.setItem(DEFAULT_STYLE_TEMPLATE_STORAGE_KEY, nextSelectedId);
  } else {
  localStorage.removeItem(DEFAULT_STYLE_TEMPLATE_STORAGE_KEY);
  }
  }
  addToast("info", `Mode deleted: ${deletedTemplate?.name ?? "custom"}`);
  } else {
  const data = await res.json();
  throw new Error(data.error || "Unable to delete mode");
  }
  } catch (err) {
  console.error("Delete template error:", err);
  addToast("error", `Mode delete failed: ${(err as Error).message}`);
  }
  },
  [styleTemplates, selectedStyleTemplateId, defaultStyleTemplateId, setStyleTemplates, setSelectedStyleTemplateId, addToast]
  );

  const handleGenerateJIC = useCallback(async () => {
    if (!currentPassage) {
      addToast("error", "请先选择一篇文章");
      return;
    }
    if (isGeneratingJIC) {
      addToast("info", "JIC 正在生成中，请等待...");
      return;
    }
    const effectiveKey = apiKey || localStorage.getItem("kanalens_api_key") || "";

    setIsGeneratingJIC(true);
    addToast("info", effectiveKey ? "正在生成全篇 JIC 解析..." : "正在用本地系统生成全篇 JIC 解析...");
    try {
      const res = await fetch("/api/jic/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(effectiveKey ? { "x-api-key": effectiveKey } : {}),
        },
        body: JSON.stringify({ passage_id: currentPassage.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "JIC generation failed");
      }

      const data = await res.json();
      setCurrentPassage({
        ...currentPassage,
        jic_sentences: data.jic_sentences,
        jic_code: data.jic_code,
      });
      addToast("success", "全篇 JIC 解析完成");
    } catch (err) {
      console.error("JIC generation error:", err);
      setError((err as Error).message);
      addToast("error", `JIC 生成失败: ${(err as Error).message}`);
    } finally {
      setIsGeneratingJIC(false);
    }
  }, [currentPassage, isGeneratingJIC, apiKey, setCurrentPassage, setError, addToast]);

  const handleFlashcardRate = useCallback(
  async (id: string, rating: SRSRating) => {
  try {
  const res = await fetch("/api/vocabulary", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id, rating }),
  });
  if (res.ok) {
  const data = await res.json();
  updateVocabulary(id, data.vocabulary);
  }
  } catch (err) {
  console.error("Flashcard rate error:", err);
  }
  },
  [updateVocabulary]
  );

  const currentAnalysisTab = currentPassage
  ? analysisStateByPassageId[currentPassage.id]?.activeTab
  : undefined;
  const activeStudyTab: RetroStudyTab = currentAnalysisTab === "words" || currentAnalysisTab === "grammar"
  ? currentAnalysisTab
  : "words";

  const handleStudyTabChange = useCallback(
  (tab: RetroStudyTab) => {
  if (!currentPassage) {
  addToast("info", "请先打开一篇文章。");
  return;
  }
  setAnalysisActiveTab(currentPassage.id, tab);
  },
  [currentPassage, setAnalysisActiveTab, addToast]
  );

  useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
  e.preventDefault();
  generateNewPassage();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
  e.preventDefault();
  setShowSearch(true);
  }
  if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
  handlePrev();
  }
  if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
  handleNext();
  }
  if (e.key === "?") {
  e.preventDefault();
  setShowShortcuts(true);
  }
  if (e.key === "1" && !e.metaKey && !e.ctrlKey && currentPassage) {
  handleStudyTabChange("words");
  }
  if (e.key === "2" && !e.metaKey && !e.ctrlKey && currentPassage) {
  handleStudyTabChange("grammar");
  }
  if (e.key === "4" && !e.metaKey && !e.ctrlKey) {
  setShowFlashcards(true);
  }
  if (e.key === "5" && !e.metaKey && !e.ctrlKey) {
  openTransJapLibrary();
  }
  };
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
  }, [generateNewPassage, handlePrev, handleNext, currentPassage, handleStudyTabChange, openTransJapLibrary, setShowFlashcards]);

  const primaryActionLabel = generationStatus === "generating" ? "生成中" : passageHistory.length === 0 ? "生成第一篇" : "生成下一篇";
  // 生成现在不依赖本地密钥：无密钥时服务端用环境变量 DEEPSEEK_API_KEY 兜底。
  // needsApiKey 仅表示"本机未存密钥"，不再拦截生成。
  const needsApiKey = !apiKey;
  const canGenerate = generationStatus !== "generating";
  const canPrev = currentPassageIndex > 0;
  const canNext = currentPassageIndex < passageHistory.length - 1;

  return (
  <div className="min-h-screen text-sumi retro-app">
  <ThreadConnect />

  <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
  KanaLens JIC portal workspace
  </div>

  <main className="min-h-screen">
  <RetroPortalWorkspace
  currentPassage={currentPassage}
  isLoading={isLoading}
  isHydrated={isHydrated}
  error={error}
  passageHistory={passageHistory}
  currentPassageIndex={currentPassageIndex}
  readCount={readPassageIds.length}
  vocabulary={vocabulary}
  grammarList={grammarList}
  styleTemplates={styleTemplates}
  selectedStyleTemplateId={selectedStyleTemplateId}
  primaryActionLabel={primaryActionLabel}
  canGenerate={canGenerate}
  canPrev={canPrev}
  canNext={canNext}
  needsApiKey={needsApiKey}
  isGenerating={generationStatus === "generating"}
  isGeneratingJIC={isGeneratingJIC}
  generationStage={generationStage}
  generationProgress={generationProgress}
  generationPreview={generationPreview}
  generationAttempt={generationAttempt}
  activeStudyTab={activeStudyTab}
  dueReviews={dueReviews}
  onGenerate={generateNewPassage}
  onOpenCorpus={openTransJapLibrary}
  onOpenSearch={() => setShowSearch(true)}
  onOpenSettings={() => setShowSettings(true)}
  onOpenFlashcards={() => setShowFlashcards(true)}
  onOpenStats={() => setShowStats(true)}
  onDeletePassage={handleDeletePassage}
  onSelectTemplate={handleSelectStyleTemplate}
  onPrev={handlePrev}
  onNext={handleNext}
  onGenerateJIC={handleGenerateJIC}
  onStudyTabChange={handleStudyTabChange}
  onAddVocabulary={handleAddVocabulary}
  onRemoveVocabulary={handleRemoveVocabulary}
  onAddGrammar={handleAddGrammar}
  onRemoveGrammar={handleRemoveGrammar}
  />
  </main>

  {showTransJapLibrary && (
  <TransJapLibraryPanel
  key={transJapLibraryQuery}
  vocabulary={vocabulary}
  initialQuery={transJapLibraryQuery}
  onOpenPassage={handleSelectPassage}
  onSaveDictionaryEntry={handleSaveTransJapDictionaryEntry}
  onClose={() => setShowTransJapLibrary(false)}
  />
  )}

  {showSettings && (
  <SettingsModal
  apiKey={apiKey}
  onSaveApiKey={handleSaveApiKey}
  styleTemplates={styleTemplates}
  selectedStyleTemplateId={selectedStyleTemplateId}
  defaultStyleTemplateId={effectiveDefaultStyleTemplateId}
  onSelectTemplate={handleSelectStyleTemplate}
  onSetDefaultTemplate={handleSetDefaultStyleTemplate}
  onCreateTemplate={handleCreateTemplate}
  onDuplicateTemplate={handleDuplicateTemplate}
  onUpdateTemplate={handleUpdateTemplate}
  onDeleteTemplate={handleDeleteTemplate}
  onClose={() => setShowSettings(false)}
  />
  )}

  {showFlashcards && (
  <FlashcardPanel
  vocabulary={vocabulary}
  onRate={handleFlashcardRate}
  onClose={() => setShowFlashcards(false)}
  />
  )}

  {showStats && (
  <StatsPanel onClose={() => setShowStats(false)} />
  )}

  {showSearch && (
  <SearchDialog
  onSelectPassage={(id) => { handleSelectPassage(id); }}
  onClose={() => setShowSearch(false)}
  />
  )}

  {showShortcuts && (
  <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
  )}

  <Toast toasts={toasts} onDismiss={dismissToast} />
  </div>
  );
}
