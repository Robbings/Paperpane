import type { ReactNode } from 'react';
import './scaffold.css';

// Temporary mounting surface for the reader interface.
export function ScaffoldPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="scaffold">
      <p>Paperpane · 纸间</p>
      <h1>{title}</h1>
      <p>界面正在设计中。</p>
      {children}
    </main>
  );
}
