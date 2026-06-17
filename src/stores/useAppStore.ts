import { create } from "zustand";
import type { Passage, Vocabulary, StyleTemplate, PassageSummary, GrammarSave } from "@/lib/types";

export type GenerationStatus = "idle" | "generating" | "done" | "error";
export type AnalysisTab = "words" | "grammar";

interface PassageAnalysisState {
  activeTab: AnalysisTab;
  glossPage: number;
  jicPage: number;
}

interface AppState {
  currentPassage: Passage | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  apiKey: string;
  vocabulary: Vocabulary[];
  grammarList: GrammarSave[];
  styleTemplates: StyleTemplate[];
  selectedStyleTemplateId: string | null;
  passageHistory: PassageSummary[];
  currentPassageIndex: number;
  sidebarOpen: boolean;
  generationStatus: GenerationStatus;
  generationStage: string;
  generationProgress: number;
  generationPreview: string;
  generationAttempt: number;
  readPassageIds: string[];
  passageStartTime: number | null;
  showFlashcards: boolean;
  showStats: boolean;
  analysisStateByPassageId: Record<string, PassageAnalysisState>;
  setHydrated: (hydrated: boolean) => void;
  setCurrentPassage: (passage: Passage | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setApiKey: (key: string) => void;
  setVocabulary: (vocabulary: Vocabulary[]) => void;
  addVocabulary: (item: Vocabulary) => void;
  updateVocabulary: (id: string, updates: Partial<Vocabulary>) => void;
  removeVocabulary: (id: string) => void;
  setGrammarList: (grammarList: GrammarSave[]) => void;
  addGrammar: (item: GrammarSave) => void;
  removeGrammar: (id: string) => void;
  setStyleTemplates: (templates: StyleTemplate[]) => void;
  setSelectedStyleTemplateId: (id: string | null) => void;
  setPassageHistory: (history: PassageSummary[]) => void;
  setCurrentPassageIndex: (index: number) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  addPassageToHistory: (summary: PassageSummary) => void;
  setGenerationStatus: (status: GenerationStatus) => void;
  setGenerationStage: (stage: string) => void;
  setGenerationProgress: (progress: number) => void;
  appendGenerationPreview: (text: string) => void;
  setGenerationAttempt: (attempt: number) => void;
  resetGeneration: () => void;
  markPassageAsRead: (id: string) => void;
  setPassageStartTime: (time: number | null) => void;
  setShowFlashcards: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  getPassageAnalysisState: (passageId: string) => PassageAnalysisState;
  setAnalysisActiveTab: (passageId: string, tab: AnalysisTab) => void;
  setAnalysisGlossPage: (passageId: string, page: number) => void;
  setAnalysisJicPage: (passageId: string, page: number) => void;
}

const initialGenerationState = {
  generationStatus: "idle" as GenerationStatus,
  generationStage: "",
  generationProgress: 0,
  generationPreview: "",
  generationAttempt: 1,
};

const DEFAULT_PASSAGE_ANALYSIS_STATE: PassageAnalysisState = {
  activeTab: "grammar",
  glossPage: 0,
  jicPage: 0,
};

function normalizeAnalysisTab(tab: AnalysisTab | "practice" | "reading" | undefined): AnalysisTab {
  return tab === "words" || tab === "grammar" ? tab : DEFAULT_PASSAGE_ANALYSIS_STATE.activeTab;
}

function getPassageAnalysisStateValue(
  analysisStateByPassageId: Record<string, PassageAnalysisState>,
  passageId: string,
): PassageAnalysisState {
  const state = analysisStateByPassageId[passageId];
  if (!state) return DEFAULT_PASSAGE_ANALYSIS_STATE;
  return {
    ...state,
    activeTab: normalizeAnalysisTab(state.activeTab as AnalysisTab | "practice" | "reading"),
  };
}

function saveReadIds(ids: string[]) {
  if (typeof window === "undefined") return;
  const trimmed = ids.slice(-500);
  localStorage.setItem("kanalens_read_ids", JSON.stringify(trimmed));
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPassage: null,
  isLoading: false,
  isHydrated: false,
  error: null,
  apiKey: "",
  vocabulary: [],
  grammarList: [],
  styleTemplates: [],
  selectedStyleTemplateId: null,
  passageHistory: [],
  currentPassageIndex: -1,
  sidebarOpen: true,
  readPassageIds: [],
  passageStartTime: null,
  showFlashcards: false,
  showStats: false,
  analysisStateByPassageId: {},
  ...initialGenerationState,
  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  setCurrentPassage: (passage) =>
    set((state) => {
      if (passage) {
        const newReadIds = state.readPassageIds.includes(passage.id)
          ? state.readPassageIds
          : [...state.readPassageIds, passage.id];
        saveReadIds(newReadIds);
        return {
          currentPassage: passage,
          currentPassageIndex: passage
            ? state.passageHistory.findIndex((p) => p.id === passage.id)
            : -1,
          readPassageIds: newReadIds,
          passageStartTime: Date.now(),
        };
      }
      return {
        currentPassage: passage,
        currentPassageIndex: -1,
      };
    }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setApiKey: (key) => set({ apiKey: key }),
  setVocabulary: (vocabulary) => set({ vocabulary }),
  addVocabulary: (item) => set((state) => ({ vocabulary: [...state.vocabulary, item] })),
  updateVocabulary: (id, updates) =>
    set((state) => ({
      vocabulary: state.vocabulary.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    })),
  removeVocabulary: (id) =>
    set((state) => ({ vocabulary: state.vocabulary.filter((v) => v.id !== id) })),
  setGrammarList: (grammarList) => set({ grammarList }),
  addGrammar: (item) => set((state) => ({ grammarList: [...state.grammarList, item] })),
  removeGrammar: (id) =>
    set((state) => ({ grammarList: state.grammarList.filter((g) => g.id !== id) })),
  setStyleTemplates: (templates) => set({ styleTemplates: templates }),
  setSelectedStyleTemplateId: (id) => set({ selectedStyleTemplateId: id }),
  setPassageHistory: (history) => set({ passageHistory: history }),
  setCurrentPassageIndex: (index) => set({ currentPassageIndex: index }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  addPassageToHistory: (summary) =>
    set((state) => {
      if (state.passageHistory.some((p) => p.id === summary.id)) {
        return { currentPassageIndex: state.passageHistory.findIndex((p) => p.id === summary.id) };
      }
      return {
        passageHistory: [summary, ...state.passageHistory],
        currentPassageIndex: 0,
      };
    }),
  setGenerationStatus: (status) => set({ generationStatus: status }),
  setGenerationStage: (stage) => set({ generationStage: stage }),
  setGenerationProgress: (progress) => set({ generationProgress: progress }),
  appendGenerationPreview: (text) =>
    set((state) => ({ generationPreview: state.generationPreview + text })),
  setGenerationAttempt: (attempt) => set({ generationAttempt: attempt }),
  resetGeneration: () => set(initialGenerationState),
  markPassageAsRead: (id) =>
    set((state) => {
      if (state.readPassageIds.includes(id)) return state;
      const newReadIds = [...state.readPassageIds, id];
      saveReadIds(newReadIds);
      return { readPassageIds: newReadIds };
    }),
  setPassageStartTime: (time) => set({ passageStartTime: time }),
  setShowFlashcards: (show) => set({ showFlashcards: show }),
  setShowStats: (show) => set({ showStats: show }),
  getPassageAnalysisState: (passageId) => getPassageAnalysisStateValue(get().analysisStateByPassageId, passageId),
  setAnalysisActiveTab: (passageId, tab) =>
    set((state) => ({
      analysisStateByPassageId: {
        ...state.analysisStateByPassageId,
        [passageId]: {
          ...getPassageAnalysisStateValue(state.analysisStateByPassageId, passageId),
          activeTab: tab,
        },
      },
    })),
  setAnalysisGlossPage: (passageId, page) =>
    set((state) => ({
      analysisStateByPassageId: {
        ...state.analysisStateByPassageId,
        [passageId]: {
          ...getPassageAnalysisStateValue(state.analysisStateByPassageId, passageId),
          glossPage: Math.max(0, page),
        },
      },
    })),
  setAnalysisJicPage: (passageId, page) =>
    set((state) => ({
      analysisStateByPassageId: {
        ...state.analysisStateByPassageId,
        [passageId]: {
          ...getPassageAnalysisStateValue(state.analysisStateByPassageId, passageId),
          jicPage: Math.max(0, page),
        },
      },
    })),
}));
