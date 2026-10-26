// 译文栏的视图模型（演示阶段，正式契约确认后再定）。
// 译文按句保存：每句知道自己的原句和在原文中的位置，界面只按顺序流式排版。

export type TranslationSentenceKind = 'heading' | 'text' | 'formula' | 'figure';

export interface TranslationSentenceView {
  id: string;
  /** 0-based page of the original sentence. */
  pageIndex: number;
  kind: TranslationSentenceKind;
  /** The original sentence, for the parallel view. */
  source: string;
  /** The translation so far; may be partial while streaming. Formulas keep their label, e.g. "公式 (1)". */
  text: string;
  /** Starts a new paragraph in the flow. */
  paragraphStart?: boolean;
  streaming?: boolean;
}

export interface TranslationPageView {
  pageIndex: number;
  state: 'untranslated' | 'translating' | 'done' | 'failed';
  sentences: readonly TranslationSentenceView[];
  error?: string;
}

/** Only the translation, or each translated sentence under its original. */
export type TranslationMode = 'translation' | 'parallel';
