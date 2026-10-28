// 译文栏的视图模型。与译文契约草稿对齐：逐句持有原文、按起始页显示、
// 暂停或失败时保留已收到的译文。正式契约确认后由容器从 TranslationSnapshot 映射。

export type TranslationSentenceKind = 'heading' | 'text' | 'formula' | 'figure';

/**
 * done: translated · streaming: arriving now · partial: some text arrived, then the task
 * paused or was interrupted · pending: not translated yet · failed: this sentence's request failed.
 * Sentences without (full) translation show their original, greyed, and stay locatable.
 */
export type TranslationSentenceState = 'done' | 'streaming' | 'partial' | 'pending' | 'failed';

export interface TranslationSentenceView {
  id: string;
  /** 0-based page where the original sentence starts; a sentence across pages is shown once, there. */
  pageIndex: number;
  /** Set when the original runs on to a later page (0-based). */
  endsOnPage?: number;
  kind: TranslationSentenceKind;
  /** The original sentence. */
  source: string;
  /** What has arrived of the translation. Formulas keep their label, e.g. "公式 (1)". */
  text: string;
  inferredMath?: boolean;
  state: TranslationSentenceState;
  /** Starts a new paragraph in the flow. */
  paragraphStart?: boolean;
  /** Its place in the paper is only approximate (e.g. damaged extraction). */
  approximate?: boolean;
}

export interface TranslationPageView {
  pageIndex: number;
  /** partial: some sentences are translated and some are not (paused, interrupted or failed). */
  state: 'untranslated' | 'translating' | 'partial' | 'done' | 'failed';
  sentences: readonly TranslationSentenceView[];
  error?: string;
}

/** The translation task as a whole, shown in the collapsed toolbar status control. */
export interface TranslationTaskView {
  saveFailed?: boolean;
  phase: 'idle' | 'running' | 'pausing' | 'paused' | 'interrupted' | 'failed' | 'completed';
  /** What is being translated now, e.g. "第 2 页". */
  current?: string;
  completedPages: number;
  totalPages: number;
  error?: string;
  completedSentences?: number;
  totalSentences?: number;
}

/** Only the translation, or each translated sentence under its original. */
export type TranslationMode = 'translation' | 'parallel';
