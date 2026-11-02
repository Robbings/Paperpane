import type { CSSProperties } from 'react';
import { Dialog, Icon, Tooltip } from '@/ui/components';
import { machineProvider, machineProviders, type MachineProvider } from '@/translation/machine-providers';
import type { TranslationApiDraft } from '../../types';

/** A monogram in the service's colour, in the same frame as the model providers' logos. */
export function TranslatorLogo({ kind, size = 'md' }: { kind: string; size?: 'sm' | 'md' | 'lg' }) {
  const provider = machineProvider(kind);
  return (
    <span
      className="pp-provider-logo pp-translator-logo"
      data-size={size}
      style={{ '--provider-ink': provider?.color ?? 'var(--pp-accent)' } as CSSProperties}
      aria-hidden="true"
    >
      {provider ? <span className="pp-translator-logo__text">{provider.name.slice(0, 1)}</span> : <Icon name="translate" size={20} />}
    </span>
  );
}

const ready = (api: TranslationApiDraft, provider: MachineProvider | undefined) =>
  !provider?.fields.some((f) => f.secret) || (api.secret.kind === 'replace' && !!api.secret.value) || (api.hadSecret && api.secret.kind === 'keep');

/** The configured translation services, as cards like the model services. */
export function TranslatorList({ apis, engineId, onSelect }: { apis: readonly TranslationApiDraft[]; engineId?: string; onSelect: (id: string) => void }) {
  return (
    <div className="pp-provider-list">
      {apis.map((api) => {
        const provider = machineProvider(api.kind);
        const hasKey = ready(api, provider);
        return (
          <button key={api.id} type="button" className="pp-provider-card" onClick={() => onSelect(api.id)}>
            <div className="pp-provider-card__main">
              <TranslatorLogo kind={api.kind} size="lg" />
              <span className="pp-model-grow">
                <span className="pp-provider-card__title">
                  <strong>{api.name || provider?.name || '翻译服务'}</strong>
                  {engineId === api.id && <span className="pp-provider-default-tag">默认引擎</span>}
                </span>
                <small className="pp-provider-address">{provider?.vendor}</small>
              </span>
              {provider?.fields.some((f) => f.secret) && (
                <Tooltip label={hasKey ? '已填写密钥' : '未填写密钥'}>
                  <span className="pp-provider-key-state" data-ready={hasKey} aria-label={hasKey ? '已填写密钥' : '未填写密钥'}>
                    <Icon name={hasKey ? 'lock' : 'sliders'} size={13} />
                  </span>
                </Tooltip>
              )}
              <span className="pp-provider-card__arrow">
                <Icon name="chevronRight" size={18} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Choosing a service to add: the same card grid as the model providers. */
export function TranslatorPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (provider: MachineProvider) => void }) {
  return (
    <div className="pp-provider-picker">
      <Dialog open onClose={onClose} title="添加翻译服务" size="lg">
        <div className="pp-provider-presets">
          {machineProviders.map((p) => (
            <button key={p.kind} type="button" className="pp-provider-preset" aria-label={`添加 ${p.name}`} onClick={() => onSelect(p)}>
              <TranslatorLogo kind={p.kind} />
              <span className="pp-provider-preset__copy">
                <strong>{p.name}</strong>
                <small>{p.vendor}</small>
              </span>
              <Icon name="chevronRight" size={16} className="pp-provider-preset__arrow" />
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
