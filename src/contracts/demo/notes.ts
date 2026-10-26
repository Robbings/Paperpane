import type { NoteContent, NoteService, NoteState, NoteVersion } from '../notes';
import { emptyNote } from '../notes';
import { failure, success } from '../common';
import { demoId, demoStore, now } from './store';
import { noteToMarkdown, validateNote } from '../../domain/notes/codec';

export function createDemoNotes(documentId: string) {
  const initial: NoteVersion = { revision: demoId(), content: emptyNote(), updatedAt: now() };
  const store = demoStore<NoteState>({ documentId, committed: initial, draft: initial.content, editVersion: 0, save: { local: 'unmodified', sync: 'unconfigured' }, history: [] });
  let busy = false;
  const conflict = (baseRevision: string) => {
    const state = store.data();
    const result = failure('CONFLICT', '两个笔记版本均已保留', ['resolve-conflict']);
    store.update({ ...state, conflict: { id: demoId(), baseRevision, local: { revision: demoId(), content: state.draft, updatedAt: now() }, remote: state.committed }, save: { local: 'editing', sync: 'conflict' } });
    return result;
  };
  const service: NoteService = {
    ...store.readable,
    edit(content) {
      const valid = validateNote(content); if (!valid.ok) return valid;
      const state = store.data();
      if (state.conflict) return failure('CONFLICT', '请先在冲突编辑器中合并两版笔记', ['resolve-conflict']);
      store.update({ ...state, draft: content, editVersion: state.editVersion + 1, save: { ...state.save, local: 'editing', error: undefined } });
      return success(undefined);
    },
    async commit(expectedRevision) {
      if (busy) return failure('BUSY', '已有保存正在进行，请等待后再次保存', ['retry']);
      if (store.data().conflict) return failure('CONFLICT', '请先处理笔记冲突', ['resolve-conflict']);
      if (expectedRevision !== store.data().committed.revision) return conflict(expectedRevision);
      busy = true;
      const before = store.data();
      store.update({ ...before, save: { ...before.save, local: 'saving', error: undefined } });
      const gate = await store.gate(); busy = false;
      const current = store.data();
      if (!gate.ok) {
        store.update({ ...current, save: { ...current.save, local: 'failed', error: gate.error } }); return gate;
      }
      if (current.committed.revision !== expectedRevision || current.conflict) return conflict(expectedRevision);
      const version = { revision: demoId(), content: before.draft, updatedAt: now() };
      store.update({ ...current, committed: version, history: [...current.history, current.committed], save: { local: current.editVersion === before.editVersion ? 'saved' : 'editing', sync: 'unconfigured' } });
      return success(structuredClone(version));
    },
    async resolve(id, resolution) {
      if (busy) return failure('BUSY', '正在保存', ['retry']);
      const before = store.data(); const issue = before.conflict;
      if (!issue || issue.id !== id) return failure('CONFLICT', '冲突版本已变化，请重新查看', ['reload']);
      const content = structuredClone(resolution.kind === 'merged' ? resolution.content : resolution.kind === 'local' ? issue.local.content : issue.remote.content);
      const valid = validateNote(content); if (!valid.ok) return valid;
      busy = true;
      const gate = await store.gate(); busy = false;
      if (!gate.ok) return gate;
      const current = store.data();
      if (current.conflict?.id !== id || current.committed.revision !== before.committed.revision) return failure('CONFLICT', '冲突版本已变化，请重新查看', ['reload']);
      const version = { revision: demoId(), content, updatedAt: now() };
      store.update({ ...current, committed: version, draft: content, editVersion: current.editVersion + 1, conflict: undefined,
        history: [...current.history, issue.local, issue.remote], save: { local: 'saved', sync: 'unconfigured' } });
      return success(structuredClone(version));
    },
    async exportMarkdown() {
      const gate = await store.gate(); if (!gate.ok) return gate;
      const result = noteToMarkdown(store.data().draft); if (!result.ok) return result;
      return success({ filename: 'notes.md', mimeType: 'text/markdown;charset=utf-8', text: result.value,
        warnings: ['Markdown 导出不作为可无损恢复的备份；完整备份保留笔记 JSON。'] });
    },
  };
  return { service, controls: { ...store.controls,
    receiveRemote(content: NoteContent) {
      const valid = validateNote(content); if (!valid.ok) return valid;
      const state = store.data();
      const remote = { revision: demoId(), content, updatedAt: now() };
      const dirty = state.save.local === 'editing' || state.save.local === 'saving' || state.save.local === 'failed' || !!state.conflict;
      store.update({ ...state, committed: remote, history: [...state.history, state.committed], ...(dirty ? {} : { draft: content }) });
      if (dirty) return conflict(state.committed.revision);
      return success(undefined);
    },
  } };
}
