import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/ui/components';
import './onboarding.css';

export interface GuideStep {
  /** The `data-tour` value of the element to light. */
  target: string;
  title: string;
  text: string;
  /** Brings the target on screen first, e.g. by switching the settings section. */
  prepare?: () => void;
}

interface GuideTourProps {
  steps: readonly GuideStep[];
  /** finished: the last step was reached and closed with its own button. */
  onClose: (finished: boolean) => void;
  /** On the last step, in place of "完成": the next thing to do. */
  finalAction?: { label: string; onAction: () => void };
}

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const GAP = 14;
const CARD = { width: 316, height: 190 };

/** Where the card goes: beside the lit area where it fits, else below or above it. */
function place(spot: Box | null, card: { width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - card.width - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - card.height - 16);
  if (!spot) return { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };
  const right = spot.left + spot.width + GAP;
  if (right + card.width <= vw - 16) return { top: clampY(spot.top), left: right };
  const below = spot.top + spot.height + GAP;
  if (below + card.height <= vh - 16) return { top: below, left: clampX(spot.left + spot.width - card.width) };
  const above = spot.top - GAP - card.height;
  if (above >= 16) return { top: above, left: clampX(spot.left + spot.width - card.width) };
  return { top: clampY(spot.top), left: clampX(spot.left - GAP - card.width) };
}

/**
 * A setup guide over the page: everything dimmed but one control, with a
 * short card beside it. The page underneath does not take clicks meanwhile.
 */
export function GuideTour({ steps, onClose, finalAction }: GuideTourProps) {
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [size, setSize] = useState(CARD);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // Each step: prepare the page, wait for the target, scroll it into view, then follow it.
  useEffect(() => {
    step.prepare?.();
    let element: Element | null = null;
    let frame = 0;
    let poll = 0;
    const started = performance.now();
    const measure = () => {
      if (!element?.isConnected) return;
      const r = element.getBoundingClientRect();
      setSpot({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    const find = () => {
      element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        measure();
        // Smooth scrolling moves it for a while: keep measuring until it settles.
        const settle = performance.now();
        const follow = () => {
          measure();
          if (performance.now() - settle < 600) frame = requestAnimationFrame(follow);
        };
        frame = requestAnimationFrame(follow);
        return;
      }
      // The page may still be switching sections; give up after a moment and point at nothing.
      if (performance.now() - started < 1200) poll = window.setTimeout(find, 50);
      else setSpot(null);
    };
    poll = window.setTimeout(find, 0);
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(poll);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [index]);

  useLayoutEffect(() => {
    const el = card.current;
    if (el && (el.offsetHeight !== size.height || el.offsetWidth !== size.width)) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  });

  useEffect(() => {
    card.current?.querySelector<HTMLElement>('[data-primary]')?.focus({ preventScroll: true });
  }, [index]);

  const next = () => (last ? onClose(true) : setIndex(index + 1));
  const back = () => index > 0 && setIndex(index - 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false);
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') back();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const position = place(spot, size);

  return createPortal(
    <div className="pp-guide" role="dialog" aria-modal="true" aria-labelledby="pp-guide-title">
      <div className="pp-guide__spot" data-empty={spot ? undefined : 'true'} style={spot ?? undefined} />
      <div ref={card} className="pp-glass pp-guide__card" data-tone="float" style={position}>
        <span className="pp-guide__step">
          {index + 1} / {steps.length}
        </span>
        <h2 id="pp-guide-title" className="pp-guide__title">
          {step.title}
        </h2>
        <p className="pp-guide__text" aria-live="polite">
          {step.text}
        </p>
        <div className="pp-guide__footer">
          <span className="pp-guide__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.target} data-on={i === index ? 'true' : undefined} />
            ))}
          </span>
          {!last && (
            <Button size="sm" variant="quiet" onClick={() => onClose(false)}>
              跳过
            </Button>
          )}
          {index > 0 && (
            <Button size="sm" onClick={back}>
              上一步
            </Button>
          )}
          {last && finalAction ? (
            <>
              <Button size="sm" onClick={() => onClose(true)}>
                完成
              </Button>
              <Button
                size="sm"
                variant="primary"
                data-primary
                onClick={() => {
                  onClose(true);
                  finalAction.onAction();
                }}
              >
                {finalAction.label}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" data-primary onClick={next}>
              {last ? '完成' : '下一步'}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
