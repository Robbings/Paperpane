import './Kbd.css';

/** A keyboard key or shortcut, e.g. <Kbd>⌘F</Kbd> or <Kbd>Esc</Kbd>. */
export function Kbd({ children }: { children: string }) {
  return <kbd className="pp-kbd">{children}</kbd>;
}
