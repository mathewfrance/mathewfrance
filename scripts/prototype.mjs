#!/usr/bin/env node
// Protótipo local (pasta prototype/, ignorada no git): gera as variantes e renderiza o README
// pela API de markdown do GitHub (mesma sanitização do perfil). Requer `gh` autenticado.
// Uso: node scripts/prototype.mjs [--offline]

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTO = path.join(ROOT, 'prototype');
const VARIANTS = { ops: 'Ops: ciano/âmbar de dashboard de SOC', phosphor: 'Phosphor: terminal verde clássico' };
const CSS_URL = 'https://cdn.jsdelivr.net/npm/github-markdown-css@5.8.1/github-markdown.css';
const offline = process.argv.includes('--offline') ? ['--offline'] : [];

await mkdir(PROTO, { recursive: true });
const css = await (await fetch(CSS_URL)).text();
await writeFile(path.join(PROTO, 'github-markdown.css'), css);

for (const v of Object.keys(VARIANTS)) {
  const dir = path.join(PROTO, v);
  await mkdir(dir, { recursive: true });
  await copyFile(path.join(ROOT, 'README.md'), path.join(dir, 'README.md'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/render.mjs'), '--variant', v, '--out', dir, ...offline], { stdio: 'inherit' });
  const md = await readFile(path.join(dir, 'README.md'), 'utf8');
  const html = execFileSync('gh', ['api', 'markdown', '-f', `text=${md}`, '-f', 'mode=gfm', '-f', 'context=mathewfrance/mathewfrance'], { encoding: 'utf8' });
  await writeFile(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${v} · profile preview</title><link rel="stylesheet" href="../github-markdown.css">
<style>body{margin:0;background:#fff}@media (prefers-color-scheme:dark){body{background:#0d1117}}.markdown-body{box-sizing:border-box;max-width:1012px;margin:0 auto;padding:32px 24px}
.frame{border:1px solid #d0d7de;border-radius:6px;padding:24px}@media (prefers-color-scheme:dark){.frame{border-color:#30363d}}@media (max-width:767px){.markdown-body{padding:16px}.frame{padding:16px}}</style></head>
<body><div class="markdown-body"><div class="frame">${html}</div></div></body></html>`);
}

const tabs = Object.entries(VARIANTS).map(([v, label], i) => `<button data-v="${v}"${i ? '' : ' aria-pressed="true"'}>${label}</button>`).join('');
await writeFile(path.join(PROTO, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Profile prototype</title>
<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui;background:#f6f8fa;color:#1f2328}@media (prefers-color-scheme:dark){body{background:#010409;color:#e6edf3}}
nav{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #8884}button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}
button[aria-pressed=true]{background:#0969da;border-color:#0969da;color:#fff}iframe{border:0;width:100%;height:calc(100vh - 60px);display:block}</style></head>
<body><nav>${tabs}</nav><iframe id="f" src="ops/index.html" title="preview"></iframe>
<script>document.querySelectorAll('button').forEach(b=>b.onclick=()=>{document.querySelectorAll('button').forEach(x=>x.removeAttribute('aria-pressed'));b.setAttribute('aria-pressed','true');document.getElementById('f').src=b.dataset.v+'/index.html'});</script></body></html>`);
console.log(`protótipo em ${PROTO}`);
