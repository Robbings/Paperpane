// View models for the overview panel: reader-defined cards, each with a
// prompt and an output form, and this paper's result for each card.

export type OverviewOutput = 'markdown' | 'list' | 'fields';

export interface OverviewCardDef {
  id: string;
  name: string;
  prompt: string;
  output: OverviewOutput;
  /** Lists only: one point per line, or short keywords. */
  listStyle?: 'bullets' | 'tags';
  /** Structured cards: a JSON Schema whose top-level properties become the rows. */
  schema?: string;
  /** A short text card shown as the page's opening lines, without a title. */
  display?: 'lead';
  /** Built-in cards can be edited, hidden and reset, but not deleted. */
  builtIn: boolean;
  visible: boolean;
}

/** Text in every form may carry source markers written as [^label]. */
export type OverviewContent =
  | { output: 'markdown'; markdown: string }
  | { output: 'list'; items: readonly string[] }
  | { output: 'fields'; fields: readonly { label: string; value: string }[] };

/** A passage the result cites; the logic layer checks the quote against the paper. */
export interface OverviewSourceView {
  label: string;
  quote: string;
  /** e.g. "第 2 页"; absent when the quote was not found. */
  pageLabel?: string;
  /** False when the quote could not be found in the paper: shown, but cannot jump. */
  verified: boolean;
}

export interface OverviewResultView {
  state: 'empty' | 'queued' | 'running' | 'completed' | 'stopped' | 'interrupted' | 'failed';
  /** Partial while running; kept when stopped, interrupted or failed. */
  content?: OverviewContent;
  sources?: readonly OverviewSourceView[];
  model?: string;
  generatedAt?: string;
  /** The card was edited after this result was generated. */
  stale?: boolean;
  error?: { message: string; recovery: readonly ('retry' | 'configure-model')[] };
}
