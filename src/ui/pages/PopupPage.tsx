import { ScaffoldPage } from '@/ui/ScaffoldPage';

export function PopupPage() {
  return (
    <ScaffoldPage title="Paperpane">
      <nav aria-label="页面入口">
        <a href="./reader.html" target="_blank" rel="noopener noreferrer">阅读器</a>
        <a href="./library.html" target="_blank" rel="noopener noreferrer">文献库</a>
        <a href="./options.html" target="_blank" rel="noopener noreferrer">设置</a>
      </nav>
    </ScaffoldPage>
  );
}
