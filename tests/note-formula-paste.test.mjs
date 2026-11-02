import test from 'node:test';
import assert from 'node:assert/strict';
import { formulaMarkdown } from '../src/domain/notes/formula-paste.ts';

test('default copied equations keep their LaTeX, including matrix row breaks', () => {
  const matrix = String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`;
  assert.equal(formulaMarkdown('\\[\n' + matrix + '\n\\]'), '$$\n' + matrix + '\n$$');
  assert.equal(formulaMarkdown(String.raw`\( E=mc^2 \)`), '$E=mc^2$');
});

test('other clipboard content uses the normal Markdown paste path', () => {
  for (const value of ['plain text', '$x$', '$$\nx\n$$', '\\alpha', '\\(x', '\\[ \\]', '`\\(x\\)`', '\\(a\\) and \\(b\\)']) {
    assert.equal(formulaMarkdown(value), undefined);
  }
});
