import { createContext, useContext, type PointerEvent } from 'react';

/** How the reader holds the translation pane: docked to the right of the paper, or floating over it. */
export interface TranslationDock {
  floating: boolean;
  onToggleFloating: () => void;
  /** Pressing the pane's header while floating moves it. */
  onHeaderPointerDown: (event: PointerEvent<HTMLElement>) => void;
}

export const TranslationDockContext = createContext<TranslationDock | null>(null);

export const useTranslationDock = () => useContext(TranslationDockContext);
