import test from 'node:test';
import assert from 'node:assert/strict';
import { mathCopyMarkdown } from '../src/ui/components/mathCopy.ts';
test('answer copy follows delimiters without rewriting code or matrix row separators', () => {
  const source = String.raw`Text $x_1$ and \[\begin{matrix}a & b \\ c & d\end{matrix}\].`;
  const brackets = mathCopyMarkdown(source, 'brackets');
  assert.match(brackets, /Text \\\(x_1\\\)/);
  assert(brackets.includes(String.raw`a & b \\ c & d`));
  const dollars = mathCopyMarkdown(source, 'dollars');
  assert(dollars.includes('$$\n\\begin{matrix}'));
  assert.equal(mathCopyMarkdown('`$x$`\n```tex\n\\[x\\]\n```', 'brackets'), '`$x$`\n```tex\n\\[x\\]\n```');
  assert.equal(mathCopyMarkdown('$x$ and \\(y\\)', 'none'), 'x and y');
  assert.equal(mathCopyMarkdown('Price \\$5 and $x$', 'brackets'), 'Price \\$5 and \\(x\\)');
});
