import type { Connection } from './connection';
import { streamModel } from './provider';
import { streamTranslationText } from './translation-provider';
import type { ModelRequest, TranslationModelRequest } from './model-request';
export type { Connection } from './connection';
export type { ModelInput, ModelRequest, TranslationModelRequest } from './model-request';
export { modelConfigurationStatus } from './model-configuration';

/** One business-facing client. Wire formats, credentials and transport choice stay inside. */
export function createModelClient(connection: Connection) {
  return {
    generate: (request: ModelRequest, signal: AbortSignal) => streamModel(connection, request, signal),
    translate: (request: TranslationModelRequest, signal: AbortSignal) =>
      streamTranslationText(connection, [
        { role: 'system', content: request.system },
        { role: 'user', content: request.text },
      ], signal, request.onText, { sessionId: request.sessionId, onDiagnostics: request.onDiagnostics }),
  };
}
