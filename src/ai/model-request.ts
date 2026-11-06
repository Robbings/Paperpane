import type { Usage } from "./types";
import type { TranslationDiagnostics } from '@/contracts/translation';
export interface ModelInput {
  role: "user" | "assistant";
  text: string;
  images?: string[];
}
export interface ModelRequest {
  webSearch?: boolean;
  onFinalText?: (text: string) => void;
  /** Cancels queued dispatch without aborting requests that have already started. */
  queueSignal?: AbortSignal;
  onDispatch?: () => void;
  /** Runs inside the model slot, before failure releases it to another request. */
  onRequestError?: (error: unknown) => void;
  imageDetail?: 'auto' | 'high' | 'low';
  outputSchema?: { name: string; schema: Record<string, unknown> };
  system: string;
  messages: ModelInput[];
  sessionId: string;
  reasoning?: string;
  onText: (delta: string) => void;
  onUsage?: (usage: Usage) => void;
}
export interface TranslationModelRequest {
  system: string;
  text: string;
  sessionId: string;
  onText: (delta: string) => Promise<void>;
  onDiagnostics?: (value: TranslationDiagnostics) => void;
}
