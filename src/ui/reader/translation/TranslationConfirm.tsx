import { Button, Dialog } from '@/ui/components';

/** A translation that may be charged, waiting for the reader's go-ahead. */
export interface TranslationConfirmRequest {
  /** translate: the whole paper for the first time, with a paid service. retry: only what did not finish. retranslate: a new version. */
  action: 'translate' | 'retry' | 'retranslate';
  scope: 'page' | 'document';
}

/** How the engine charges. tokens: language models; characters: paid translation services, with an estimate. */
export type TranslationCost = { kind: 'tokens' } | { kind: 'characters'; characters: number } | { kind: 'free' };

interface Props {
  request: TranslationConfirmRequest | null;
  /** The engine that will do it, e.g. "DeepL"; unnamed when unknown. */
  engineLabel?: string;
  cost?: TranslationCost;
  onConfirm: (request: TranslationConfirmRequest) => void;
  onClose: () => void;
}

const titles = {
  translate: { page: '翻译本页', document: '翻译全文' },
  retry: { page: '重试未完成的译文', document: '重试未完成的译文' },
  retranslate: { page: '重新翻译本页', document: '重新翻译全文' },
} as const;

/** One sentence each: what will happen, then what it may cost. */
function description(request: TranslationConfirmRequest, engineLabel: string | undefined, cost: TranslationCost) {
  const by = engineLabel ? `用 ${engineLabel} ` : '';
  const what =
    request.action === 'retranslate'
      ? `${by}生成新的译文，旧的记录仍保留。`
      : request.action === 'retry'
        ? `${by}重试没完成的句子，已完成的不会再请求。`
        : `${by}翻译整篇论文。`;
  const charge =
    cost.kind === 'tokens' ? '会请求模型，按用量计费。' : cost.kind === 'characters' ? `约 ${cost.characters.toLocaleString('zh-CN')} 字符，按字符计费。` : '';
  return what + charge;
}

/** Asks before a translation that sends text again or may be charged; the same words for every engine. */
export function TranslationConfirm({ request, engineLabel, cost = { kind: 'tokens' }, onConfirm, onClose }: Props) {
  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      title={request ? titles[request.action][request.scope] : ''}
      description={request ? description(request, engineLabel, cost) : undefined}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => request && onConfirm(request)}>
            {request?.action === 'retry' ? '重试' : request?.action === 'retranslate' ? '重新翻译' : '翻译'}
          </Button>
        </>
      }
    />
  );
}
