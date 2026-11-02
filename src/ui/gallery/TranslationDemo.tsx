import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/ui/components';
import { TranslationPane } from '@/ui/reader/translation/TranslationPane';
import { SelectionTranslationWindow } from '@/ui/reader/translation/SelectionTranslationWindow';
import { TranslationConfirm } from '@/ui/reader/translation/TranslationConfirm';
import type { TranslationEngineOption, TranslationMode, TranslationPageView, TranslationTaskView } from '@/ui/reader/translation/types';
import { machineTargets } from '@/translation/machine-providers';
import type { TranslationLanguage } from '@/translation/languages';
import './TranslationDemo.css';

// 组件目录里的翻译引擎示例：译文栏的引擎选择与页来源、选区翻译窗口、确认弹窗。数据都是假的。

const engines: TranslationEngineOption[] = [
  { value: 'llm:', label: '跟随默认模型', shortLabel: '默认模型', group: 'llm' },
  { value: 'llm:gpt', label: 'GPT-4o · OpenAI', shortLabel: 'GPT-4o', group: 'llm' },
  { value: 'mt:deepl', label: 'DeepL', group: 'machine', languages: machineTargets('deepl') },
  { value: 'mt:google', label: '谷歌翻译', group: 'machine', languages: machineTargets('google-free') },
];

const pages: TranslationPageView[] = [
  {
    pageIndex: 0,
    state: 'done',
    engineLabel: 'GPT-4o',
    sentences: [
      { id: 'a', pageIndex: 0, kind: 'heading', source: 'Introduction', text: '引言', state: 'done' },
      { id: 'b', pageIndex: 0, kind: 'text', paragraphStart: true, source: 'Large models translate well.', text: '大模型的翻译质量较好。', state: 'done' },
      { id: 'c', pageIndex: 0, kind: 'text', source: 'They are also slower.', text: '但速度也更慢。', state: 'done' },
    ],
  },
  {
    pageIndex: 1,
    state: 'done',
    sentences: [{ id: 'd', pageIndex: 1, kind: 'text', paragraphStart: true, source: 'Machine translation is fast.', text: '机器翻译速度很快。', state: 'done' }],
  },
  {
    pageIndex: 2,
    state: 'untranslated',
    sentences: [{ id: 'e', pageIndex: 2, kind: 'text', paragraphStart: true, source: 'This page is not translated yet.', text: '', state: 'pending' }],
  },
];

const task: TranslationTaskView = { phase: 'idle', completedPages: 2, totalPages: 3 };

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tr-demo__frame">
      <span className="tr-demo__label">{label}</span>
      {children}
    </div>
  );
}

export function TranslationDemo() {
  const [mode, setMode] = useState<TranslationMode>('translation');
  const [engine, setEngine] = useState('mt:deepl');
  const [confirmOpen,setConfirmOpen]=useState(false);
  const [selection, setSelection] = useState({ engine: 'mt:google', target: 'zh-CN' as TranslationLanguage, done: true });
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const passage = useRef<HTMLSpanElement>(null);
  const rects = () => {
    const r = passage.current?.getBoundingClientRect();
    return r ? [{ left: r.left, top: r.top, width: r.width, height: r.height }] : [];
  };
  return (
    <div className="tr-demo">
      <Frame label="译文栏：点右上角任务状态换引擎；第 1 页的译文来自另一个引擎">
        <div className="tr-demo__pane">
          <TranslationPane
            pages={pages}
            mode={mode}
            onMode={setMode}
            follow
            onFollow={() => {}}
            onClose={() => {}}
            activeId={null}
            onHover={() => {}}
            onLocate={() => {}}
            task={task}
            onTranslatePage={() => {}}
            onTranslateAll={() => setConfirmOpen(true)}
            onPause={() => {}}
            onResume={() => {}}
            onRetryPage={() => {}}
            onRetranslatePage={() => setConfirmOpen(true)}
            onRetranslateAll={() => {}}
            engine={{ value: engine, options: engines }}
            onEngine={setEngine}
            reveal={null}
          />
        </div>
      </Frame>
      <Frame label="选区翻译：齿轮里换引擎，所选引擎不支持的语言不能选">
        <div className="tr-demo__paper" ref={setContainer}>
          <div className="pdfViewer">
            <div className="page tr-demo__page">
              <p>
                <span ref={passage}>Machine translation is fast and cheap,</span> which makes it practical to translate a whole paper as soon as it is
                opened.
              </p>
            </div>
          </div>
          {container && (
            <SelectionTranslationWindow
              container={container}
              anchorPoint={() => {
                const r = rects()[0];
                return r ? { x: r.left, y: r.top + r.height + 12 } : null;
              }}
              sourceRects={rects}
              subscribeGeometry={() => () => {}}
              text="Machine translation is fast and cheap,"
              sourceLanguage="auto"
              targetLanguage={selection.target}
              busy={false}
              paused={false}
              retrying={false}
              saveFailed={false}
              hasOutput={selection.done}
              engine={{ value: selection.engine, options: engines }}
              onTranslate={(_source, target, next) => setSelection({ engine: next ?? selection.engine, target, done: true })}
              onClose={() => setSelection((s) => ({ ...s, done: false }))}
              onPause={() => {}}
              onRetry={() => {}}
              onLocate={() => {}}
            >
              {selection.done && <p>机器翻译又快又便宜，</p>}
            </SelectionTranslationWindow>
          )}
        </div>
      </Frame>
      <Frame label="首次翻译提示">
        <Button onClick={()=>setConfirmOpen(true)}>开始翻译</Button>
      </Frame>
      <TranslationConfirm open={confirmOpen} onClose={()=>setConfirmOpen(false)}
        onConfirm={()=>setConfirmOpen(false)} onSettings={()=>setConfirmOpen(false)}/>

    </div>
  );
}
