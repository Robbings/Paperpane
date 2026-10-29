import test from 'node:test';
import assert from 'node:assert/strict';
import { arxivPdfUrl, readerImportUrl } from '../src/browser-entry/arxiv.ts';

test('现代编号、版本、HTML 与 PDF 链接指向同一论文', () => {
  for (const path of ['abs/1706.03762v7', 'html/1706.03762v7', 'pdf/1706.03762v7.pdf']) {
    assert.equal(arxivPdfUrl(`https://arxiv.org/${path}?download=1#page=2`), 'https://arxiv.org/pdf/1706.03762v7');
  }
});

test('支持旧式 arXiv 编号', () => {
  assert.equal(arxivPdfUrl('https://arxiv.org/abs/hep-th/9901001v2'), 'https://arxiv.org/pdf/hep-th/9901001v2');
});

test('拒绝伪造站点、认证信息、无效编号和非论文页面', () => {
  for (const url of ['javascript:alert(1)', 'https://arxiv.org.evil.test/abs/1706.03762', 'https://evil.test/abs/1706.03762', 'https://user:secret@arxiv.org/abs/1706.03762', 'https://arxiv.org/search/', 'https://arxiv.org/abs/../../x', 'https://arxiv.org/abs/1706.03762/extra']) {
    assert.throws(() => arxivPdfUrl(url));
  }
});

test('后台构造阅读器 URL，一次解码即可得到原 PDF 地址', () => {
  const target = new URL(readerImportUrl('chrome-extension://paperpane/reader.html', 'https://arxiv.org/abs/1706.03762v7'));
  assert.equal(target.pathname, '/reader.html');
  assert.equal(target.searchParams.get('import'), 'https://arxiv.org/pdf/1706.03762v7');
  assert.equal(target.searchParams.get('source'), 'arxiv');
});
