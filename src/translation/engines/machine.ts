import type { TranslationEngine, EngineSentenceResult } from '../engine';
import type { ResolvedMachine } from '../resolve';
import { TranslationError } from '../errors';
import { machineSlot } from '../machine/slot';
import { protectText, escapeMarkdown, splitText } from '../machine/text';
import { incomplete } from '../machine/transport';
import { bytes } from '../machine/sign';

export function createMachineEngine(machine: ResolvedMachine): TranslationEngine {
  const { api, provider, settings, translator } = machine;
  const unmaskedRetry = new Set<string>();
  const singleRequestRetry = new Set<string>();
  // Limit the encoded body conservatively where a supplier documents bytes instead of characters.
  const cap = Math.min(settings.maxCharacters, provider.maxCharacters);
  const measure =
    api.kind === 'baidu'
      ? (s: string) => bytes(s).length
      : ['deepl', 'google-cloud'].includes(api.kind)
        ? (s: string) => bytes(JSON.stringify(s)).length
        : (s: string) => s.length;
  const itemCap = Math.min(cap - 20, provider.maxTextLength ?? Infinity);
  return {
    id: 'machine:' + api.kind,
    async translate(input, onOutput) {
      type Piece = {
        id: string;
        index: number;
        text: string;
        restore?: (text: string) => string | undefined;
      };
      const pieces: Piece[] = [],
        missing = new Set<string>();
      const parts = new Map<string, (string | undefined)[]>();
      const output = (id: string, fragments: (string | undefined)[]): EngineSentenceResult => ({
        id,
        text: escapeMarkdown(fragments.join('')),
        complete: true,
        inferredMath: false,
      });
      for (const sentence of input.sentences) {
        const fragments: (string | undefined)[] = [];
        parts.set(sentence.id, fragments);
        const mask = settings.protectSpans ? protectText(sentence.source) : undefined;
        if (mask && !unmaskedRetry.has(sentence.id) && measure(mask.masked) <= itemCap) {
          pieces.push({ id: sentence.id, index: 0, text: mask.masked, restore: mask.restore });
          fragments.push(undefined);
          continue;
        }
        // On overflow or a lost placeholder, translate only the prose and stitch the original spans back locally.
        for (const fragment of mask?.fragments ?? [{ text: sentence.source, literal: false }]) {
          if (fragment.literal) {
            fragments.push(fragment.text);
            continue;
          }
          for (const chunk of splitText(fragment.text, itemCap, measure)) {
            const text = chunk.trim();
            if (!text) {
              fragments.push(chunk);
              continue;
            }
            fragments.push(chunk.slice(0, chunk.indexOf(text)));
            pieces.push({ id: sentence.id, index: fragments.length, text });
            fragments.push(undefined, chunk.slice(chunk.indexOf(text) + text.length));
          }
        }
        if (fragments.every((part) => part !== undefined))
          await onOutput({ raw: '', sentences: [output(sentence.id, fragments)] });
      }
      for (let index = 0; index < pieces.length;) {
        const batch: Piece[] = [],
          limit = provider.maxTexts;
        let length = 0;
        while (index < pieces.length && batch.length < limit) {
          const piece = pieces[index]!,
            size = measure(piece.text) + 1;
          if (
            batch.length &&
            (singleRequestRetry.has(piece.id) ||
              singleRequestRetry.has(batch[0]!.id) ||
              length + size > cap ||
              (provider.joinLines && (piece.text.includes('\n') || batch[0]!.text.includes('\n'))))
          )
            break;
          batch.push(piece);
          length += size;
          index++;
        }
        let values: string[];
        try {
          values = await machineSlot(api.id, settings, input.signal, () =>
            translator.translate({
              texts: batch.map((piece) => piece.text),
              from: input.sourceLanguage,
              to: input.language,
              signal: input.signal,
            }),
          );
        } catch (error) {
          if (error instanceof TranslationError && error.recovery === 'content') {
            for (const piece of batch) singleRequestRetry.add(piece.id);
          }
          throw error;
        }
        const complete: EngineSentenceResult[] = [];
        batch.forEach((piece, i) => {
          const value = values[i];
          const restored = value?.trim() ? (piece.restore ? piece.restore(value) : value) : undefined;
          if (!restored) {
            missing.add(piece.id);
            if (value && piece.restore) unmaskedRetry.add(piece.id);
            return;
          }
          const part = parts.get(piece.id)!;
          part[piece.index] = restored;
          if (part.every((text) => text !== undefined)) complete.push(output(piece.id, part));
        });
        if (complete.length) await onOutput({ raw: JSON.stringify(values), sentences: complete });
      }
      if (missing.size) throw incomplete();
    },
  };
}
