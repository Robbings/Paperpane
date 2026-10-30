/** Package the production settings page as one HTML file, with no external assets. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const requireFromVite = createRequire(import.meta.resolve('vite'));
const { rolldown } = await import(pathToFileURL(requireFromVite.resolve('rolldown')).href);
const root = resolve('.output/chrome-mv3');
const html = await readFile(root + '/options.html', 'utf8');
const entry = html.match(/<script[^>]+src="([^"]+)"/)[1];
const bundle = await rolldown({ input: root + entry });
try {
  const { output } = await bundle.generate({ format: 'iife', codeSplitting: false, minify: true });
  if (output.length !== 1 || output[0].type !== 'chunk') throw new Error('Expected a single settings bundle');
  const styles = [];
  for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)) styles.push(await readFile(root + match[1], 'utf8'));
  const license = await Promise.all(['models.dev-MIT.txt', 'lobe-icons-MIT.txt'].map(async name => `${name}\n${await readFile('public/licenses/' + name, 'utf8')}`));
  // Callback replacements preserve literal $ sequences inside the generated code.
  const result = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '')
    .replace('</head>', () => `<style>${styles.join('\n').replaceAll('</style', '<\\/style')}</style>\n<!--\n${license.join('\n\n')}\n-->\n</head>`)
    .replace('</body>', () => `<script>if(!location.hash)location.hash='models';</script><script>${output[0].code.replaceAll('</script', '<\\/script')}</script></body>`);
  await mkdir('backups/model-settings-preview', { recursive: true });
  await writeFile('backups/model-settings-preview/Paperpane-model-settings.html', result);
  console.log('Standalone preview:', Buffer.byteLength(result), 'bytes');
} finally { await bundle.close(); }
