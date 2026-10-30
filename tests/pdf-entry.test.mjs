import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfSourceUrl, isPdfLink, isPdfResponse, shouldAutoOpen, browserEntryDefaults } from '../src/browser-entry/pdf.ts';

test('通用来源支持 HTTP(S) 与查询参数，拒绝凭据和浏览器内部网址', () => {
  assert.equal(pdfSourceUrl('https://papers.test/download?file=abc%2Fxyz#page=3'), 'https://papers.test/download?file=abc%2Fxyz');
  for (const url of ['javascript:alert(1)', 'file:///c:/paper.pdf', 'chrome://settings', 'https://a:b@papers.test/a.pdf']) assert.throws(() => pdfSourceUrl(url));
});

test('PDF 链接支持后缀、arXiv 及明确类型，无须请求网页所有链接', () => {
  assert.equal(isPdfLink('https://papers.test/PAPER.PDF?token=1'), true);
  assert.equal(isPdfLink('https://arxiv.org/pdf/1706.03762'), true);
  assert.equal(isPdfLink('https://papers.test/download?id=1', 'application/pdf'), true);
  assert.equal(isPdfLink('https://papers.test/about'), false);
  assert.equal(isPdfLink('https://papers.test/foo.pdf.html'), false);
});

test('响应识别按 MIME，忽略错误、附件与子框架', () => {
  const details = { url: 'https://papers.test/download?id=1', type: 'main_frame', statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'Application/PDF; charset=binary' }] };
  assert.equal(isPdfResponse(details), true);
  assert.equal(isPdfResponse({ ...details, type: 'sub_frame' }), false);
  assert.equal(isPdfResponse({ ...details, statusCode: 403 }), false);
  assert.equal(isPdfResponse({ ...details, responseHeaders: [{ name: 'content-type', value: 'text/html' }] }), false);
  assert.equal(isPdfResponse({ ...details, responseHeaders: [...details.responseHeaders, { name: 'Content-Disposition', value: 'attachment; filename="paper.pdf"' }] }), false);
});

test('默认手动打开；返回原 PDF 的同标签页不自动循环', () => {
  const url = 'https://papers.test/paper.pdf';
  assert.deepEqual(browserEntryDefaults, { autoOpenPdf: false, showPdfButtons: true });
  assert.equal(shouldAutoOpen(browserEntryDefaults, url), false);
  assert.equal(shouldAutoOpen({ ...browserEntryDefaults, autoOpenPdf: true }, url), true);
  assert.equal(shouldAutoOpen({ autoOpenPdf: true, showPdfButtons: false }, url), true);
  assert.equal(shouldAutoOpen({ ...browserEntryDefaults, autoOpenPdf: true }, url, url + '#page=2'), false);
  assert.equal(shouldAutoOpen({ ...browserEntryDefaults, autoOpenPdf: true }, url, 'https://papers.test/another.pdf'), true);
});
