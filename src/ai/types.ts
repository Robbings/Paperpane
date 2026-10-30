import type { Conversation, ChatMessage } from "@/contracts/conversation";
import type { ExtractedPaper } from "@/contracts/translation";
import type {
  OverviewCardDef,
  OverviewResultView,
} from "@/ui/reader/overview/types";
import type { TranslationAttempt } from "@/contracts/translation";
export interface Usage {
  input?: number;
  output?: number;
  cached?: number;
  reasoning?: number;
  elapsedMs: number;
  firstTokenMs?: number;
}
export interface ContextManifest {
  mode: "full" | "retrieval" | "chunked";
  window: number;
  estimatedTokens: number;
  sourceIds: string[];
  historyMessages: number;
  totalSources: number;
}
export interface ResearchAttempt
  extends Omit<TranslationAttempt, "sentenceIds"> {
  kind: "discuss" | "explain" | "overview" | "suggest";
  messageId?: string;
  modelId: string;
  usage?: Usage;
  context?: ContextManifest;
}
export interface ResearchMessage extends ChatMessage {
  textSources?: import("@/contracts/document").SelectionSnapshot[];
  recoveryGeneration?: ChatMessage["generation"];
  usage?: Usage;
  context?: ContextManifest;
}
export interface ResearchConversation extends Omit<Conversation, "messages"> {
  messages: ResearchMessage[];
  reasoning?: string;
  initialPromptId?: string;
  textSources?: import("@/contracts/document").SelectionSnapshot[];
}
export interface OverviewRun {
  cards?: OverviewCardDef[];
  id: string;
  signature: string;
  results: Record<string, OverviewResultView>;
  attempts: ResearchAttempt[];
  createdAt: string;
}
export interface ResearchRecord {
  explanationWindows?: { id: string; closed: boolean; collapsed?: boolean; layout?: import('@/ui/reader/windows/PassageWindow').PassageWindowLayout }[];
  activeDiscussionId?: string;
  activeExplanationId?: string;
  revision: string;
  sessions: ResearchConversation[];
  attempts: ResearchAttempt[];
  cards: OverviewCardDef[];
  overviews: OverviewRun[];
  activeOverviewId?: string;
}
export interface ResearchSnapshot {
  record: ResearchRecord;
  paper?: ExtractedPaper;
  loading: boolean;
  error?: string;
  unsaved: boolean;
  modelsReady: boolean;
}
export const emptyRecord = (): ResearchRecord => ({
  revision: "empty",
  sessions: [],
  attempts: [],
  cards: [],
  overviews: [],
});
