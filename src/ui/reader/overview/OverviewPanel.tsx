import { useState } from 'react';
import { Badge, Button, IconButton, ScrollArea } from '@/ui/components';
import { PanelHeader } from '../panels/PanelHeader';
import { OverviewCard } from './OverviewCard';
import { OverviewEditor } from './OverviewEditor';
import type { OverviewCardDef, OverviewResultView } from './types';
import './overview.css';

export interface OverviewPanelProps {
  demo?: boolean;
  /** All cards in display order, hidden ones included (for the editor). */
  cards: readonly OverviewCardDef[];
  /** This paper's result per card id; a missing entry counts as not generated. */
  results: Readonly<Record<string, OverviewResultView>>;
  /** A model is configured and the overview feature is on. */
  modelReady: boolean;
  /** Generates the given cards; nothing runs until the reader asks. */
  onGenerate: (cardIds: string[]) => void;
  onStop: (cardId: string) => void;
  onSaveCard: (card: OverviewCardDef) => void;
  onRemoveCard: (id: string) => void;
  onResetCard: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onVisible: (id: string, visible: boolean) => void;
  onConfigureModels: () => void;
}

const emptyResult: OverviewResultView = { state: 'empty' };

/** The paper at a glance: one section per visible card, generated only on request. */
export function OverviewPanel(props: OverviewPanelProps) {
  const [editing, setEditing] = useState(false);
  const visible = props.cards.filter((card) => card.visible);
  const resultOf = (id: string) => props.results[id] ?? emptyResult;
  const pending = visible.filter((card) => ['empty', 'failed', 'interrupted'].includes(resultOf(card.id).state));
  const nothingYet = visible.every((card) => resultOf(card.id).state === 'empty');

  return (
    <div className="pp-panel pp-ov">
      <PanelHeader
        title={editing ? '概览卡片' : '概览'}
        meta={props.demo && !editing ? <Badge>演示，不会调用模型</Badge> : undefined}
        actions={
          editing ? (
            <Button size="sm" onClick={() => setEditing(false)}>
              完成
            </Button>
          ) : (
            <>
              {!nothingYet && pending.length > 0 && (
                <Button size="sm" variant="quiet" disabled={!props.modelReady} onClick={() => props.onGenerate(pending.map((card) => card.id))}>
                  生成其余 {pending.length} 张
                </Button>
              )}
              <IconButton icon="settings" label="管理概览卡片" size="md" shape="pill" onClick={() => setEditing(true)} />
            </>
          )
        }
      />

      {editing ? (
        <OverviewEditor
          cards={props.cards}
          onSave={props.onSaveCard}
          onRemove={props.onRemoveCard}
          onReset={props.onResetCard}
          onReorder={props.onReorder}
          onVisible={props.onVisible}
        />
      ) : (
        <ScrollArea className="pp-ov__scroll" viewportClassName="pp-ov__viewport">
          {!props.modelReady && (
            <div className="pp-ov__notice">
              <span>配置模型后才能生成概览。已生成的结果仍可查看。</span>
              <Button size="sm" variant="quiet" onClick={props.onConfigureModels}>
                打开模型设置
              </Button>
            </div>
          )}
          {nothingYet && visible.length > 0 && props.modelReady && (
            <div className="pp-ov__start">
              <p>
                让模型通读全文，按下面 {visible.length} 张卡片整理这篇论文：{visible.map((card) => card.name).join('、')}。结果会自动保存，下次打开直接显示。
              </p>
              <Button size="sm" variant="primary" onClick={() => props.onGenerate(visible.map((card) => card.id))}>
                生成概览
              </Button>
            </div>
          )}
          {visible.length === 0 ? (
            <p className="pp-panel__empty">所有卡片都已隐藏。点右上角的按钮管理卡片。</p>
          ) : (
            visible.map((card) => (
              <OverviewCard
                key={card.id}
                card={card}
                result={resultOf(card.id)}
                canGenerate={props.modelReady}
                onGenerate={() => props.onGenerate([card.id])}
                onStop={() => props.onStop(card.id)}
                onConfigureModels={props.onConfigureModels}
              />
            ))
          )}
        </ScrollArea>
      )}
    </div>
  );
}
