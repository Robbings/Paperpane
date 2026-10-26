import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import './Dialog.css';

interface DialogProps {
  open: boolean;
  /** Called on Esc, the close button or a backdrop click (when dismissible). */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned. Put the primary action last. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * False for decisions that must be answered explicitly (e.g. a save
   * conflict): Esc and backdrop clicks are ignored and there is no close button.
   */
  dismissible?: boolean;
}

/**
 * A modal glass dialog on the native <dialog> element: focus stays inside,
 * the page behind is inert, and focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'sm', dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Stays mounted through the closing animation.
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      // Also covers reopening while a close animation is still running.
      setClosing(false);
      if (!dialog.open) dialog.showModal();
      // Start in the first field; otherwise on the first footer button, which
      // by convention is the safe choice (cancel). Never on the close button.
      const target =
        dialog.querySelector<HTMLElement>('.pp-dialog__body :is(input, textarea, select):not(:disabled)') ??
        dialog.querySelector<HTMLElement>('.pp-dialog__footer button:not(:disabled)');
      target?.focus();
      return;
    }
    if (!dialog.open) return;
    setClosing(true);
    // animationend may never fire (reduced motion, background tabs), so close anyway.
    const fallback = window.setTimeout(() => {
      setClosing(false);
      dialog.close();
    }, 260);
    return () => window.clearTimeout(fallback);
  }, [open]);

  const finishClose = () => {
    if (!closing) return;
    setClosing(false);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="pp-dialog"
      data-size={size}
      data-closing={closing ? 'true' : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click on the <dialog> itself (not its panel) is the backdrop.
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) finishClose();
      }}
    >
      <div className="pp-glass pp-dialog__panel" data-tone="float">
        <div className="pp-dialog__header">
          <h2 id={titleId} className="pp-dialog__title">
            {title}
          </h2>
          {dismissible && <IconButton icon="close" label="关闭" size="md" shape="pill" onClick={onClose} />}
        </div>
        {description && (
          <div id={descriptionId} className="pp-dialog__description">
            {description}
          </div>
        )}
        {children && <div className="pp-dialog__body">{children}</div>}
        {footer && <div className="pp-dialog__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
