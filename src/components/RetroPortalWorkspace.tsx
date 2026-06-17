"use client";

import React, { useMemo, useState } from "react";
import type { AnnotatedSegment, GrammarPoint, GrammarSave, JICSentenceCode, Passage, PassageSummary, Vocabulary, WordGloss } from "@/lib/types";

export type RetroStudyTab = "words" | "grammar";

interface RetroPortalWorkspaceProps {
  currentPassage: Passage | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  passageHistory: PassageSummary[];
  currentPassageIndex: number;
  readCount: number;
  vocabulary: Vocabulary[];
  grammarList: GrammarSave[];
  styleTemplates: { id: string; name: string }[];
  selectedStyleTemplateId: string | null;
  primaryActionLabel: string;
  canGenerate: boolean;
  canPrev: boolean;
  canNext: boolean;
  needsApiKey: boolean;
  isGenerating: boolean;
  isGeneratingJIC: boolean;
  generationStage: string;
  generationProgress: number;
  generationPreview: string;
  generationAttempt: number;
  activeStudyTab: RetroStudyTab;
  dueReviews: number;
  onGenerate: () => void;
  onOpenCorpus: (query?: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenFlashcards: () => void;
  onOpenStats: () => void;
  onDeletePassage: (id: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onGenerateJIC: () => void;
  onStudyTabChange: (tab: RetroStudyTab) => void;
  onAddVocabulary: (wg: WordGloss) => void;
  onRemoveVocabulary: (word: string) => void;
  onAddGrammar: (gp: GrammarPoint) => void;
  onRemoveGrammar: (pattern: string) => void;
}

interface SentenceEntry {
  id: string;
  text: string;
  paragraphIndex: number;
  sentenceIndex: number;
  globalIndex: number;
  segments: AnnotatedSegment[];
}

type TokenType = "variable" | "operator" | "method" | "punct";

interface JICToken {
  type: TokenType;
  value: string;
  keyword?: string;
}

type PendingDelete =
  | { kind: "passage"; id: string; label: string }
  | { kind: "word"; word: string }
  | { kind: "grammar"; pattern: string };

const PARTICLE_LABELS: Record<string, string> = {
  TOPIC: "は", SUBJ: "が", TARGET: "を", INTO: "に", TIME: "に", GIVE_TO: "に",
  AT: "で", USING: "で", TOWARD: "へ", FROM: "から", UNTIL: "まで", OF: "の",
  ALSO: "も", AND: "と", WITH: "と", CAUSE: "ので", QUES: "か",
};

const KANBUN_CONFIDENCE_LABELS: Record<NonNullable<JICSentenceCode["kanbun_confidence"]>, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const JIC_ROLE_LABELS: Record<string, string> = {
  topic: "主题",
  subject: "主语",
  target: "对象",
  destination: "趋向",
  time: "时间",
  recipient: "受与",
  location: "处所",
  means: "手段",
  direction: "方向",
  source: "起点",
  limit: "终点",
  comparison: "比较",
  possessive: "所属",
  also: "并提",
  and: "并列",
  companion: "伴随",
  cause: "原因",
  question: "疑问",
};

function jicRoleLabel(role: string): string {
  return JIC_ROLE_LABELS[role] ?? role;
}

function hasKanji(value: string): boolean {
  return /[一-龯]/.test(value);
}

function normalizeSentence(value: string): string {
  return value.replace(/[\s\n\r「」『』、，,.]/g, "");
}

function splitSegmentBySentence(segment: AnnotatedSegment): AnnotatedSegment[] {
  const parts: AnnotatedSegment[] = [];
  let buffer = "";
  for (const char of segment.surface) {
    buffer += char;
    if (/[。！？!?]/.test(char)) {
      parts.push({
        surface: buffer,
        reading: buffer === segment.surface ? segment.reading : buffer,
        is_kanji: buffer === segment.surface ? segment.is_kanji : hasKanji(buffer),
      });
      buffer = "";
    }
  }
  if (buffer) {
    parts.push({
      surface: buffer,
      reading: buffer === segment.surface ? segment.reading : buffer,
      is_kanji: buffer === segment.surface ? segment.is_kanji : hasKanji(buffer),
    });
  }
  return parts;
}

function splitPassageSentences(passage: Passage | null): SentenceEntry[] {
  if (!passage) return [];
  const sentences: SentenceEntry[] = [];
  let globalIndex = 0;

  passage.paragraphs.forEach((paragraph, paragraphIndex) => {
    let current: AnnotatedSegment[] = [];
    let sentenceIndex = 0;

    const flush = () => {
      const text = current.map((segment) => segment.surface).join("").trim();
      if (!text) { current = []; return; }
      sentences.push({
        id: `${paragraphIndex}-${sentenceIndex}-${globalIndex}`,
        text, paragraphIndex, sentenceIndex, globalIndex, segments: current,
      });
      current = [];
      sentenceIndex += 1;
      globalIndex += 1;
    };

    paragraph.annotated.forEach((segment) => {
      for (const part of splitSegmentBySentence(segment)) {
        current.push(part);
        if (/[。！？!?]$/.test(part.surface)) flush();
      }
    });
    flush();
  });

  return sentences;
}

function parseJICLine(line: string): JICToken[] {
  const tokens: JICToken[] = [];
  const re = /\[([A-Z_-]+)\]|\.(not|past|polite|passive|causative|can|want|vol|then|while|after|if|exist|exist_intent|complete|go|come|nominalize|seems|possible|not_formal|hon|hum|is|become)\(\)|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match[1]) tokens.push({ type: "operator", value: `[${match[1]}]`, keyword: match[1] });
    else if (match[2]) tokens.push({ type: "method", value: `.${match[2]}()` });
    else if (match[3]) tokens.push({ type: /[。、]/.test(match[3]) ? "punct" : "variable", value: match[3] });
  }
  return tokens;
}

function AnnotatedSentence({ segments }: { segments: AnnotatedSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        segment.is_kanji ? (
          <ruby key={`${segment.surface}-${index}`}>
            {segment.surface}<rp>(</rp><rt>{segment.reading}</rt><rp>)</rp>
          </ruby>
        ) : (
          <span key={`${segment.surface}-${index}`}>{segment.surface}</span>
        )
      ))}
    </>
  );
}

function JicCodeStrip({ code }: { code: string }) {
  const tokens = useMemo(() => parseJICLine(code), [code]);
  if (!code) return null;
  return (
    <div className="retro-jic-code">
      {tokens.map((token, index) => {
        if (token.type === "operator") {
          return (
            <span key={`${token.value}-${index}`} className="retro-jic-token retro-jic-token--operator" title={token.keyword ? PARTICLE_LABELS[token.keyword] ?? token.keyword : token.value}>
              {token.value}
            </span>
          );
        }
        if (token.type === "method") {
          return <span key={`${token.value}-${index}`} className="retro-jic-token retro-jic-token--method">{token.value}</span>;
        }
        return <span key={`${token.value}-${index}`} className="retro-jic-token retro-jic-token--variable">{token.value}</span>;
      })}
    </div>
  );
}

function findJicSentence(sentence: SentenceEntry | undefined, allSentences: SentenceEntry[], jicSentences: JICSentenceCode[] | undefined): JICSentenceCode | null {
  if (!sentence || !jicSentences?.length) return null;
  const target = normalizeSentence(sentence.text);
  const exact = jicSentences.find((item) => normalizeSentence(item.original) === target);
  if (exact) return exact;
  return jicSentences[sentence.globalIndex] ?? jicSentences[allSentences.indexOf(sentence)] ?? null;
}

function RetroConfirmDialog({
  pendingDelete,
  onCancel,
  onConfirm,
}: {
  pendingDelete: PendingDelete;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = pendingDelete.kind === "passage"
    ? pendingDelete.label
    : pendingDelete.kind === "word"
      ? pendingDelete.word
      : pendingDelete.pattern;
  const itemType = pendingDelete.kind === "passage" ? "文章" : pendingDelete.kind === "word" ? "单词" : "语法";

  return (
    <div className="retro-confirm-backdrop" role="presentation" onClick={onCancel}>
      <div className="retro-confirm-box" role="dialog" aria-modal="true" aria-labelledby="retro-confirm-title" onClick={(e) => e.stopPropagation()}>
        <div className="retro-box-title retro-box-title--orange">
          <span id="retro-confirm-title">删除确认</span>
          <b>CAUTION</b>
        </div>
        <div className="retro-confirm-body">
          <p>确定要删除这个{itemType}吗？</p>
          <strong>{label}</strong>
          <small>这个操作会立即写入本地资料库。</small>
        </div>
        <div className="retro-confirm-actions">
          <button onClick={onCancel} className="retro-button">取消</button>
          <button onClick={onConfirm} className="retro-button retro-button--danger">确认删除</button>
        </div>
      </div>
    </div>
  );
}

function RetroStudyColumn({
  passage,
  vocabulary,
  grammarList,
  activeTab,
  onTabChange,
  onAddVocabulary,
  onRemoveVocabulary,
  onAddGrammar,
  onRemoveGrammar,
}: {
  passage: Passage | null;
  vocabulary: Vocabulary[];
  grammarList: GrammarSave[];
  activeTab: RetroStudyTab;
  onTabChange: (tab: RetroStudyTab) => void;
  onAddVocabulary: (wg: WordGloss) => void;
  onRemoveVocabulary: (word: string) => void;
  onAddGrammar: (gp: GrammarPoint) => void;
  onRemoveGrammar: (pattern: string) => void;
}) {
  const savedWords = useMemo(() => new Set(vocabulary.map((v) => v.word)), [vocabulary]);
  const savedGrammar = useMemo(() => new Set(grammarList.map((g) => g.pattern)), [grammarList]);

  const tabs: { id: RetroStudyTab; label: string; count: number | string }[] = [
    { id: "words", label: "单词", count: passage?.word_gloss.length ?? 0 },
    { id: "grammar", label: "语法", count: passage?.grammar_points.length ?? 0 },
  ];

  return (
    <section className="retro-study-col" aria-label="单词语法">
      <div className="retro-box-title retro-box-title--lime">
        <span>记 · 单词/语法</span>
        <b>{passage ? "ARTICLE" : "EMPTY"}</b>
      </div>

      <div className="retro-col-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={activeTab === tab.id ? "is-active" : ""}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}<span>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="retro-col-body">
        {!passage && <div className="retro-empty">打开一篇文章后在此积累词汇与语法。</div>}

        {passage && activeTab === "words" && (
          <div className="retro-card-list">
            {passage.word_gloss.map((word) => {
              const saved = savedWords.has(word.word);
              return (
                <div key={`${word.word}-${word.reading}`} className="retro-word-card">
                  <div className="retro-word-head">
                    <b>{word.word}</b>
                    <span>{word.reading}</span>
                    <em>{word.pos}</em>
                  </div>
                  <p>{word.gloss_en}</p>
                  <button onClick={() => saved ? onRemoveVocabulary(word.word) : onAddVocabulary(word)} className="retro-button">
                    {saved ? "已存·删除" : "+ 保存"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {passage && activeTab === "grammar" && (
          <div className="retro-card-list">
            {passage.grammar_points.map((grammar) => {
              const saved = savedGrammar.has(grammar.pattern);
              return (
                <div key={grammar.pattern} className="retro-grammar-card">
                  <b>{grammar.pattern}</b>
                  <p>{grammar.explanation_en}</p>
                  <button onClick={() => saved ? onRemoveGrammar(grammar.pattern) : onAddGrammar(grammar)} className="retro-button">
                    {saved ? "已存·删除" : "+ 保存"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
}

export default function RetroPortalWorkspace({
  currentPassage,
  isLoading,
  isHydrated,
  error,
  passageHistory,
  currentPassageIndex,
  readCount,
  vocabulary,
  grammarList,
  styleTemplates,
  selectedStyleTemplateId,
  primaryActionLabel,
  canGenerate,
  canPrev,
  canNext,
  needsApiKey,
  isGenerating,
  isGeneratingJIC,
  generationStage,
  generationProgress,
  generationPreview,
  generationAttempt,
  activeStudyTab,
  dueReviews,
  onGenerate,
  onOpenCorpus,
  onOpenSearch,
  onOpenSettings,
  onOpenFlashcards,
  onOpenStats,
  onDeletePassage,
  onSelectTemplate,
  onPrev,
  onNext,
  onGenerateJIC,
  onStudyTabChange,
  onAddVocabulary,
  onRemoveVocabulary,
  onAddGrammar,
  onRemoveGrammar,
}: RetroPortalWorkspaceProps) {
  const sentences = useMemo(() => splitPassageSentences(currentPassage), [currentPassage]);
  const [activeSelection, setActiveSelection] = useState({ passageId: "", index: 0 });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const selectedTemplateId = selectedStyleTemplateId ?? styleTemplates[0]?.id ?? "";
  const activeSentenceIndex = activeSelection.passageId === currentPassage?.id ? activeSelection.index : 0;
  const activeSentence = sentences[Math.min(activeSentenceIndex, Math.max(0, sentences.length - 1))];

  const activeJicCount = currentPassage?.jic_sentences?.length ?? 0;
  const kanbunReadyCount = currentPassage?.jic_sentences?.filter((item) => item.kanbun_core?.trim()).length ?? 0;
  const jicSentence = findJicSentence(activeSentence, sentences, currentPassage?.jic_sentences);
  const hasJic = Boolean(jicSentence?.kanbun_core?.trim());

  const bulletins = [
    currentPassage ? `本篇 ${sentences.length} 句` : "等待文章",
    `已读 ${readCount} 篇`,
    `JIC-Han ${kanbunReadyCount}/${Math.max(1, activeJicCount)}`,
    `生词 ${vocabulary.length} · 语法 ${grammarList.length}`,
    dueReviews > 0 ? `待复习 ${dueReviews}` : "复习已清空",
  ];

  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "passage") onDeletePassage(pendingDelete.id);
    if (pendingDelete.kind === "word") onRemoveVocabulary(pendingDelete.word);
    if (pendingDelete.kind === "grammar") onRemoveGrammar(pendingDelete.pattern);
    setPendingDelete(null);
  };

  return (
    <div className="retro-page">
      {/* ── Masthead: brand + single action bar ── */}
      {(isGenerating || isGeneratingJIC) ? (
        <header className="retro-brand-bar--fusion retro-gen-bar">
          <div className="retro-brand-leds">
            <span className="retro-led retro-led--green retro-led--blink" title="Generating" />
            <span className="retro-led retro-led--amber" title="Power" />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="retro-gen-bar-stage">
                {isGeneratingJIC && !isGenerating ? "COMPILING JIC" : (generationStage || "GENERATING")}
              </span>
              {generationAttempt > 1 && <span className="retro-gen-bar-meta">ATTEMPT {generationAttempt}</span>}
              {isGenerating && (
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ffe14d", marginLeft: "auto" }}>
                  {Math.round(generationProgress)}%
                </span>
              )}
            </div>
            <div className="retro-gen-bar-track">
              <div
                className={`retro-gen-bar-fill ${isGeneratingJIC && !isGenerating ? "retro-gen-bar-fill--indeterminate" : ""}`}
                style={{ width: isGeneratingJIC && !isGenerating ? undefined : `${Math.max(2, generationProgress)}%` }}
              />
            </div>
            {generationPreview && <div className="retro-gen-bar-preview">{generationPreview.slice(-100)}</div>}
          </div>
          <div className="retro-brand-logo--fusion" aria-label="kanojoniaitai">
            <span>kano</span><b>joni</b><span>aitai</span>
          </div>
        </header>
      ) : (
        <header className="retro-brand-bar--fusion">
          <div className="retro-brand-logo--fusion" aria-label="kanojoniaitai brand logo">
            <span>kano</span><b>joni</b><span>aitai</span>
          </div>
          <nav className="retro-mast-nav" aria-label="Primary actions">
            <button
              onClick={onGenerate}
              disabled={!canGenerate || isGenerating}
              className="retro-button retro-button--primary"
            >
              {isGenerating ? "生成中" : primaryActionLabel}
            </button>
            <button onClick={onPrev} disabled={!canPrev || isLoading} className="retro-button">上一篇</button>
            <button onClick={onNext} disabled={!canNext || isLoading} className="retro-button">下一篇</button>
            <select
              value={selectedTemplateId}
              onChange={(e) => onSelectTemplate(e.target.value || null)}
              aria-label="Reading mode"
              className="retro-mast-select"
            >
              {styleTemplates.length === 0 && <option value="">未配置模式</option>}
              {styleTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={onOpenFlashcards} className="retro-button">复习 {dueReviews}</button>
            <button onClick={() => onOpenCorpus()} className="retro-button">语料</button>
            <button onClick={onOpenSearch} className="retro-button">搜索</button>
            <button onClick={onOpenStats} className="retro-button">统计</button>
            <button onClick={onOpenSettings} className="retro-button">设置</button>
          </nav>
        </header>
      )}

      <div className={`retro-marquee--fusion ${error ? "retro-marquee--alert" : ""}`}>
        <span>{error ? "系统消息：" : "本站公告："}</span>
        <b>{error || bulletins.join("　|　")}</b>
      </div>

      {/* ── Three columns: 段落 | JIC | 单词/语法 ── */}
      <div className="retro-triptych">
        {/* COLUMN 1 — Paragraph reader */}
        <section className="retro-reader-panel" aria-label="段落阅读">
          <div className="retro-box-title retro-box-title--cyan">
            <span>段落 · 逐句</span>
            <b>{currentPassage ? `${currentPassageIndex + 1}/${Math.max(1, passageHistory.length)}` : "EMPTY"}</b>
          </div>

          {isLoading && (
            <div className="retro-loading"><div className="retro-loading-bar" />Loading…</div>
          )}

          {!currentPassage && !isLoading && isHydrated && (
            <div className="retro-empty retro-empty--large">
              <strong>NO MEDIA</strong>
              <p>JIC 工作台正在等待一篇文章。</p>
              <button
                onClick={onGenerate}
                disabled={!canGenerate}
                className="retro-button retro-button--primary"
              >
                {primaryActionLabel}
              </button>
            </div>
          )}

          {currentPassage && (
            <>
              <div className="retro-passage-head">
                <h2>{currentPassage.title_ja}</h2>
                <p>{currentPassage.title_en}</p>
                <div>
                  <span>{sentences.length} 句</span>
                  <span>{currentPassage.word_gloss.length} 词</span>
                  <span>{currentPassage.grammar_points.length} 语法</span>
                </div>
              </div>
              <div className="retro-paragraph-reader">
                {sentences.map((sentence) => (
                  <button
                    key={sentence.id}
                    onClick={() => setActiveSelection({ passageId: currentPassage.id, index: sentence.globalIndex })}
                    className={`retro-sentence ${sentence.globalIndex === activeSentence?.globalIndex ? "is-active" : ""}`}
                  >
                    <span className="retro-sentence-index">P{sentence.paragraphIndex + 1}-{sentence.sentenceIndex + 1}</span>
                    <span className="retro-sentence-text"><AnnotatedSentence segments={sentence.segments} /></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* COLUMN 2 — JIC analysis of the selected sentence */}
        <section className="retro-jic-panel" aria-label="JIC 助詞解剖">
          <div className="retro-jic-panel-head">
            <span className={`retro-led retro-led--green ${isGeneratingJIC ? "retro-led--blink" : ""}`} />
            <span>JIC 助詞解剖室</span>
            {currentPassage && (
              <button onClick={onGenerateJIC} disabled={isGeneratingJIC} className="retro-button retro-button--primary" style={{ marginLeft: "auto" }}>
                {isGeneratingJIC ? "生成中…" : hasJic ? "重生成" : "生成全篇JIC"}
              </button>
            )}
          </div>

          <div className="retro-jic-meter">
            <div className="retro-jic-meter-item"><span>JIC</span><b>{activeJicCount}</b></div>
            <div className="retro-jic-meter-item"><span>Kanbun</span><b>{kanbunReadyCount}</b></div>
            <div className="retro-jic-meter-item"><span>Words</span><b>{vocabulary.length}</b></div>
            <div className="retro-jic-meter-item"><span>Gram</span><b>{grammarList.length}</b></div>
          </div>

          <div className="retro-jic-panel-body">
            {!currentPassage && <div className="retro-empty">先生成或选择一篇文章。</div>}

            {currentPassage && activeSentence && (
              <>
                <div className="retro-inspector-block">
                  <div className="retro-mini-title">原句 · P{activeSentence.paragraphIndex + 1}-{activeSentence.sentenceIndex + 1}</div>
                  <p className="retro-original-line">{activeSentence.text}</p>
                </div>

                {!jicSentence && (
                  <div className="retro-inspector-block retro-inspector-block--callout">
                    <div className="retro-mini-title">未生成</div>
                    <p>点击上方「生成全篇JIC」解析所有句子的助词结构。</p>
                  </div>
                )}

                {jicSentence?.kanbun_core && (
                  <div className="retro-inspector-block retro-kanbun-block">
                    <div className="retro-mini-title">文言骨架 / Kanbun Core</div>
                    <p>{jicSentence.kanbun_core}</p>
                    {(jicSentence.kanbun_source || jicSentence.kanbun_confidence) && (
                      <small>
                        {jicSentence.kanbun_source
                          ? jicSentence.kanbun_source === "local-rule" ? "本地规则" : "模型校验"
                          : "来源未知"}
                        {jicSentence.kanbun_confidence ? ` · 可信度 ${KANBUN_CONFIDENCE_LABELS[jicSentence.kanbun_confidence]}` : ""}
                      </small>
                    )}
                    {jicSentence.kanbun_warnings && jicSentence.kanbun_warnings.length > 0 && (
                      <small>本地提示：此句结构存在待复核项。</small>
                    )}
                  </div>
                )}

                {jicSentence?.jic_code && (
                  <div className="retro-inspector-block">
                    <div className="retro-mini-title">JIC 显式标签</div>
                    <JicCodeStrip code={jicSentence.jic_code} />
                  </div>
                )}

                {jicSentence?.particle_reconstruction && jicSentence.particle_reconstruction.length > 0 && (
                  <div className="retro-inspector-block">
                    <div className="retro-mini-title">助词角色</div>
                    <div className="retro-reconstruct-list">
                      {jicSentence.particle_reconstruction.map((item, index) => (
                        <div key={`${item.surface}-${item.particle}-${index}`} className="retro-reconstruct-row">
                          <span>{item.surface}</span><b>{item.particle}</b><em>{jicRoleLabel(item.role)}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* COLUMN 3 — words / grammar */}
        <RetroStudyColumn
          passage={currentPassage}
          vocabulary={vocabulary}
          grammarList={grammarList}
          activeTab={activeStudyTab}
          onTabChange={onStudyTabChange}
          onAddVocabulary={onAddVocabulary}
          onRemoveVocabulary={(word) => setPendingDelete({ kind: "word", word })}
          onAddGrammar={onAddGrammar}
          onRemoveGrammar={(pattern) => setPendingDelete({ kind: "grammar", pattern })}
        />
      </div>

      {pendingDelete && (
        <RetroConfirmDialog
          pendingDelete={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
      )}
    </div>
  );
}
