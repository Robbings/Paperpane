// View models for the overview panel: reader-defined cards, each with a
// prompt and an output form, and this paper's result for each card.

export type OverviewOutput = 'markdown' | 'list' | 'fields';

export interface OverviewCardDef {
  id: string;
  name: string;
  prompt: string;
  output: OverviewOutput;
  /** Lists only: one point per line, or short tags. */
  listStyle?: 'bullets' | 'tags';
  /** Structured cards: a JSON Schema whose top-level properties become the rows. */
  schema?: string;
  /** Built-in cards can be edited, hidden and reset, but not deleted. */
  builtIn: boolean;
  visible: boolean;
}

export type OverviewContent =
  | { output: 'markdown'; markdown: string }
  | { output: 'list'; items: readonly string[] }
  | { output: 'fields'; fields: readonly { label: string; value: string }[] };

export interface OverviewResultView {
  state: 'empty' | 'queued' | 'running' | 'completed' | 'stopped' | 'interrupted' | 'failed';
  /** Partial while running; kept when stopped, interrupted or failed. */
  content?: OverviewContent;
  model?: string;
  generatedAt?: string;
  /** The card was edited after this result was generated. */
  stale?: boolean;
  error?: { message: string; recovery: readonly ('retry' | 'configure-model')[] };
}
