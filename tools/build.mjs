/* Build: one self-contained dist/index.html (JS + CSS inlined) plus the
 * font files and favicon. Run: npm run build */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });

const three = path.join(ROOT, 'vendor/three');
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: ['es2020'], legalComments: 'eof',
  plugins: [{ name: 'three', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(three, 'three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, a => ({ path: path.join(three, 'addons', a.path.slice('three/addons/'.length)) }));
  } }],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = (await esbuild.transform(fs.readFileSync(path.join(ROOT, 'css/studio.css'), 'utf8'), { loader: 'css', minify: true })).code.replace(/\.\.\/fonts\//g, 'fonts/');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/studio.css">/, () => `<style>${css}</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script type="module">${js}</script>`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
for (const f of fs.readdirSync(path.join(ROOT, 'fonts'))) fs.copyFileSync(path.join(ROOT, 'fonts', f), path.join(DIST, 'fonts', f));
fs.copyFileSync(path.join(ROOT, 'favicon.svg'), path.join(DIST, 'favicon.svg'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(fs.statSync(path.join(DIST, 'index.html')).size));
