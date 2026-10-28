import type { TranslationSentence } from '@/contracts/translation';
import type { TranslationDiagnostics } from '@/contracts/translation';
export interface EngineSentenceResult { id: string; text: string; complete: boolean; inferredMath?: boolean }
export interface TranslationEngine {
  id: string;
  /** LLMs accept paragraph context; conventional engines can ignore it and return IDs by input order. */
  translate(input: { sentences: readonly TranslationSentence[]; context: string; language: string; sourceLanguage?: string; signal: AbortSignal; sessionId: string; onDiagnostics?: (value: TranslationDiagnostics) => void },
    onOutput: (output: { raw: string; sentences: EngineSentenceResult[] }) => Promise<void>): Promise<void>;
}
