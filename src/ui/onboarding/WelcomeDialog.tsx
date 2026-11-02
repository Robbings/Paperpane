import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon, LogoMark, type IconName } from '@/ui/components';
import './onboarding.css';

const features: { icon: IconName; title: string; text: string }[] = [
  { icon: 'pageDisplay', title: '专注阅读', text: '自动识别公式、表格和图片；高亮、批注和笔记都留在论文旁。' },
  { icon: 'translate', title: '对照翻译', text: '整页或整篇对照翻译，划选一句也能翻。可以用大模型，也可以用翻译服务。' },
  { icon: 'explain', title: '解释与提问', text: '选中一段让模型解释，或者就整篇论文提问、生成概览。' },
  { icon: 'library', title: '文献库', text: '收藏、分类和检索读过的论文，可以通过 WebDAV 同步和备份。' },
];

/** A reader page with its translation beside it: the product in one picture. */
function Preview() {
  return (
    <div className="pp-welcome__preview" aria-hidden="true">
      <div className="pp-welcome__sheet">
        <span className="pp-welcome__line" data-w="title" />
        <span className="pp-welcome__line" />
        <span className="pp-welcome__line" data-mark="true" />
        <span className="pp-welcome__line" data-w="short" />
        <span className="pp-welcome__figure" />
        <span className="pp-welcome__line" />
        <span className="pp-welcome__line" data-w="short" />
      </div>
      <div className="pp-welcome__sheet" data-side="translation">
        <span className="pp-welcome__line" data-w="title" />
        <span className="pp-welcome__line" />
        <span className="pp-welcome__line" data-mark="true" />
        <span className="pp-welcome__line" data-w="short" />
        <span className="pp-welcome__line" />
        <span className="pp-welcome__line" />
        <span className="pp-welcome__line" data-w="short" />
      </div>
      <LogoMark size={40} className="pp-welcome__mark" />
    </div>
  );
}

interface WelcomeDialogProps {
  open: boolean;
  /** Starts the setup guide. */
  onStart: () => void;
  /** "稍后", Esc or the backdrop: the welcome does not come back on its own. */
  onClose: () => void;
}

/** The first page opened after installing: what Paperpane does, and an offer to set it up. */
export function WelcomeDialog({ open, onStart, onClose }: WelcomeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setClosing(false);
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      return;
    }
    if (!dialog.open) return;
    setClosing(true);
    const fallback = window.setTimeout(() => {
      setClosing(false);
      dialog.close();
    }, 260);
    return () => window.clearTimeout(fallback);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="pp-dialog pp-welcome"
      data-closing={closing ? 'true' : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && closing) {
          setClosing(false);
          ref.current?.close();
        }
      }}
    >
      <div className="pp-glass pp-welcome__panel" data-tone="float">
        <Preview />
        <div className="pp-welcome__body">
          <h2 id={titleId} className="pp-welcome__title">
            欢迎使用纸间
          </h2>
          <p className="pp-welcome__lead">在浏览器里读论文：打开 PDF，对照翻译，有不懂的地方直接问模型。</p>
          <ul className="pp-welcome__features">
            {features.map((f) => (
              <li key={f.title}>
                <span className="pp-welcome__icon">
                  <Icon name={f.icon} size={17} />
                </span>
                <span>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="pp-welcome__footer">
          <span className="pp-welcome__note">配置模型和翻译服务，大约需要两分钟。</span>
          <Button onClick={onClose}>稍后</Button>
          <Button variant="primary" data-autofocus onClick={onStart}>
            开始配置引导
          </Button>
        </div>
      </div>
    </dialog>
  );
}
