#!/usr/bin/env node
// Gera os SVGs do perfil a partir de data/projects.json (+ eventos públicos do GitHub).
// Zero dependências. Uso: node scripts/render.mjs [--variant ops|phosphor] [--out dir] [--offline]
//
// Regra de animação: o valor base de cada atributo é o estado FINAL (visível). As animações
// SMIL começam em 0s e partem do estado inicial, então um renderizador sem SMIL mostra tudo.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const OFFLINE = args.includes('--offline');

const data = JSON.parse(await readFile(path.join(ROOT, 'data/projects.json'), 'utf8'));
const VARIANT = opt('variant', data.profile.theme);
const OUT = path.resolve(opt('out', ROOT));

// ---------------------------------------------------------------- temas
// Só escuro: o painel fica escuro também no tema claro do navegador (fundo branco deixava o
// painel claro sem contraste com a página). Os nomes de arquivo mantêm o sufixo -dark.
const THEMES = {
  ops: {
    dark: { bg: '#0a0f1a', panel: '#0d1524', bar: '#111b2e', border: '#1f2b40', fg: '#d3dceb', dim: '#8494b0', accent: '#22d3ee', ok: '#34d399', warn: '#fbbf24', info: '#60a5fa', crit: '#f87171', idle: '#7b8aa3', prompt: '#a78bfa' },
  },
  phosphor: {
    dark: { bg: '#040905', panel: '#07110a', bar: '#0a180e', border: '#173520', fg: '#b8f5c8', dim: '#6aa67b', accent: '#39ff88', ok: '#39ff88', warn: '#f4d35e', info: '#7fe7c4', crit: '#ff6b6b', idle: '#5f8a6b', prompt: '#39ff88', fx: true },
  },
};
if (!THEMES[VARIANT]) throw new Error(`variante desconhecida: ${VARIANT}`);

const STATUS_COLOR = { ONLINE: 'ok', STAGING: 'info', BUILDING: 'accent', VALIDATING: 'warn', STANDBY: 'idle' };
const STATUS_BLINK = { ONLINE: 2.4, STAGING: 2, BUILDING: 1, VALIDATING: 1.6 };
for (const h of data.hosts) {
  if (!STATUS_COLOR[h.status]) throw new Error(`${h.id}: status inválido "${h.status}"`);
  if (h.url && !/^https:\/\//.test(h.url)) throw new Error(`${h.id}: url precisa ser https://`);
}

// ---------------------------------------------------------------- helpers
const W = 840;
const WM = 420; // compacta, servida em celular via <source media="(max-width: 600px)"> no README
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;
const cw = (size) => size * 0.6; // largura estimada do caractere monoespaçado (estimativa conservadora)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fit = (s, max) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const n = (v) => Math.round(v * 100) / 100;
// Quebra por palavra em até `lines` linhas de `max` caracteres; o excedente vai para a última com "…".
const wrap = (s, max, lines = Infinity) => {
  const out = [];
  let cur = null;
  for (const word of String(s).trim().split(/\s+/)) {
    const next = cur === null ? word : `${cur} ${word}`;
    if (next.length > max && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  out.push(cur); // texto vazio vira uma linha vazia, nunca "undefined"
  if (out.length > lines) out.splice(lines - 1, Infinity, out.slice(lines - 1).join(' '));
  return out.map((l) => fit(l, max));
};

// Aparece em `at` segundos (fade de `d`). Valor base = visível.
const fadeIn = (at, d = 0.25) => {
  const total = at + d;
  return `<animate attributeName="opacity" values="0;0;1" keyTimes="0;${n(at / total)};1" dur="${n(total)}s" fill="freeze"/>`;
};
const blink = (dur) => `<animate attributeName="opacity" values="1;0.25;1" dur="${dur}s" repeatCount="indefinite"/>`;

function frame(t, { w = W, h, title, right = '', body, fx }) {
  const glow = fx && t.fx;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  ${glow ? `<filter id="glow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity="0.35"/></pattern>` : ''}
  <clipPath id="win"><rect width="${w}" height="${h}" rx="10"/></clipPath>
</defs>
<style>text{font-family:${MONO};}</style>
<g clip-path="url(#win)">
  <rect width="${w}" height="${h}" fill="${t.panel}"/>
  <rect width="${w}" height="34" fill="${t.bar}"/>
  <line x1="0" y1="34" x2="${w}" y2="34" stroke="${t.border}"/>
  <circle cx="20" cy="17" r="4" fill="${t.accent}">${blink(2)}</circle>
  <text x="34" y="21.5" font-size="12" fill="${t.dim}" letter-spacing="0.5">${esc(title)}</text>
  <text x="${w - 18}" y="21.5" font-size="12" fill="${t.dim}" text-anchor="end">${right}</text>
  <g${glow ? ' filter="url(#glow)"' : ''}>
${body}
  </g>
  ${glow ? `<rect width="${w}" height="${h}" fill="url(#scan)" pointer-events="none"/>` : ''}
</g>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${t.border}"/>
</svg>
`;
}

const countBy = (hosts) => hosts.reduce((acc, h) => ((acc[h.status] = (acc[h.status] || 0) + 1), acc), {});

// ---------------------------------------------------------------- hero (boot + radar)
// Linha do prompt com o comando "digitado" (clip em degraus, um por caractere).
function typedPrompt(t, x, y, fs) {
  const promptTxt = `${data.profile.user}@${data.profile.host}:~$ `;
  const cmd = './whoami --verbose';
  const cmdX = x + promptTxt.length * cw(fs);
  const steps = cmd.length;
  const typeStart = 0.4, typeEnd = 1.5;
  const widths = Array.from({ length: steps + 1 }, (_, i) => n(i * cw(fs) + (i ? 2 : 0)));
  const times = widths.map((_, i) => n((typeStart + ((typeEnd - typeStart) * i) / steps) / typeEnd));
  const promptAttrs = `font-size="${fs}" fill="${t.prompt}" textLength="${n(promptTxt.trimEnd().length * cw(fs))}" lengthAdjust="spacingAndGlyphs"`;
  const out = [
    `<clipPath id="typed"><rect x="${cmdX}" y="${y - 16}" width="${widths.at(-1) + 4}" height="22"><animate attributeName="width" values="0;${widths.join(';')}" keyTimes="0;${times.join(';')}" calcMode="discrete" dur="${typeEnd}s" fill="freeze"/></rect></clipPath>`,
    `<text x="${x}" y="${y}" ${promptAttrs}>${esc(promptTxt.trimEnd())}</text>`,
    `<text x="${cmdX}" y="${y}" font-size="${fs}" fill="${t.fg}" clip-path="url(#typed)">${esc(cmd)}</text>`,
  ];
  // prompt final + cursor, posicionado depois das linhas de boot
  const final = (at, fy) => `<g>${fadeIn(at, 0.1)}<text x="${x}" y="${fy + 6}" ${promptAttrs}>${esc(promptTxt.trimEnd())}</text>
    <rect x="${x + promptTxt.length * cw(fs)}" y="${fy - 6}" width="8" height="15" fill="${t.accent}"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect></g>`;
  return { out, final };
}

function radar(t, cx, cy, r, { blipFs = 9, countFs = 11 } = {}) {
  const { hosts } = data;
  const rad = [];
  for (const k of [1, 2 / 3, 1 / 3]) rad.push(`<circle cx="${cx}" cy="${n(cy)}" r="${n(r * k)}" fill="none" stroke="${t.border}" stroke-width="1"/>`);
  rad.push(`<line x1="${cx - r}" y1="${n(cy)}" x2="${cx + r}" y2="${n(cy)}" stroke="${t.border}"/><line x1="${cx}" y1="${n(cy - r)}" x2="${cx}" y2="${n(cy + r)}" stroke="${t.border}"/>`);
  // feixe: gira no sentido horário; o rastro (setores com opacidade decrescente) fica atrás da linha
  const wedge = (a0, a1, op) => {
    const p = (d) => `${n(cx + r * Math.cos((d * Math.PI) / 180))},${n(cy - r * Math.sin((d * Math.PI) / 180))}`;
    return `<path d="M${cx},${n(cy)} L${p(a0)} A${n(r)},${n(r)} 0 0,0 ${p(a1)} Z" fill="${t.accent}" opacity="${op}"/>`;
  };
  rad.push(`<g>${wedge(0, 12, 0.3)}${wedge(12, 26, 0.17)}${wedge(26, 45, 0.08)}
    <line x1="${cx}" y1="${n(cy)}" x2="${n(cx + r)}" y2="${n(cy)}" stroke="${t.accent}" stroke-width="1.5" opacity="0.9"/>
    <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${n(cy)}" to="360 ${cx} ${n(cy)}" dur="5s" repeatCount="indefinite"/></g>`);
  // blips: ângulo fixo por índice; raio pelo estado (online mais perto do centro)
  const ring = { ONLINE: 0.38, STAGING: 0.55, BUILDING: 0.72, VALIDATING: 0.62, STANDBY: 0.88 };
  hosts.forEach((hst, i) => {
    const ang = ((i * 360) / hosts.length + 20) * (Math.PI / 180);
    const rr = r * (ring[hst.status] ?? 0.8);
    const bx = n(cx + rr * Math.cos(ang)), by = n(cy - rr * Math.sin(ang));
    const c = t[STATUS_COLOR[hst.status]];
    // pulso sincronizado com a passagem do feixe (horário, 5s, começa em 0°)
    const deg = (i * 360) / hosts.length + 20;
    const phase = n((((360 - (deg % 360)) % 360) / 360) * 5);
    rad.push(`<circle cx="${bx}" cy="${by}" r="3.5" fill="${c}"/>
    <circle cx="${bx}" cy="${by}" r="3.5" fill="none" stroke="${c}" opacity="0"><animate attributeName="r" values="3.5;11" dur="5s" begin="${phase}s" keyTimes="0;1" keySplines="0.2 0.6 0.4 1" calcMode="spline" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0;0" keyTimes="0;0.25;1" dur="5s" begin="${phase}s" repeatCount="indefinite"/></circle>
    <text x="${n(bx + 7)}" y="${n(by + blipFs / 2 - 1)}" font-size="${blipFs}" fill="${t.dim}">${esc(hst.id.replace('HOST-', 'H'))}</text>`);
  });
  const c = countBy(hosts);
  rad.push(`<text x="${cx}" y="${n(cy + r + 18)}" font-size="${countFs}" fill="${t.dim}" text-anchor="middle">${hosts.length} assets · ${c.ONLINE || 0} online · ${c.BUILDING || 0} building</text>`);
  return rad;
}

const bootTag = (t, line) => {
  const tagColor = line.tag === 'OK' ? t.ok : t.warn;
  const tag = line.tag.length === 2 ? ` ${line.tag} ` : line.tag.padEnd(4);
  return `<tspan fill="${t.dim}">[</tspan><tspan fill="${tagColor}" font-weight="700">${esc(tag)}</tspan><tspan fill="${t.dim}">]</tspan>`;
};

function hero(t) {
  const { profile, boot } = data;
  const x = 26;
  const { out, final } = typedPrompt(t, x, 66, 13);

  // nome + papel
  let at = 1.8;
  out.push(`<g>${fadeIn(at, 0.4)}<text x="${x}" y="108" font-size="30" font-weight="700" fill="${t.accent}" letter-spacing="3">${esc(profile.name.toUpperCase())}</text></g>`);
  at += 0.3;
  out.push(`<g>${fadeIn(at, 0.4)}<text x="${x}" y="134" font-size="13" fill="${t.dim}" letter-spacing="1">${esc(profile.role)}</text></g>`);

  // linhas de boot
  let y = 170;
  at += 0.4;
  for (const line of boot) {
    out.push(`<g>${fadeIn(at, 0.15)}<text x="${x}" y="${y}" font-size="13" fill="${t.fg}">${bootTag(t, line)} ${esc(fit(line.text, 64))}</text></g>`);
    y += 24;
    at += 0.32;
  }
  out.push(final(at, y));
  const h = y + 34;

  // radar
  const rad = radar(t, 712, 34 + (h - 34) / 2, Math.min(112, (h - 34) / 2 - 22));
  return frame(t, {
    h,
    title: `${profile.login}.sec — boot.log`,
    right: 'tty1',
    body: out.join('\n') + '\n' + rad.join('\n'),
    fx: true,
  });
}

// Compacta (celular): boot em largura total com quebra de linha, radar embaixo.
function heroM(t) {
  const { profile, boot } = data;
  const w = WM, x = 22, fs = 14;
  const { out, final } = typedPrompt(t, x, 64, fs);
  let at = 1.8;
  out.push(`<g>${fadeIn(at, 0.4)}<text x="${x}" y="106" font-size="28" font-weight="700" fill="${t.accent}" letter-spacing="2">${esc(profile.name.toUpperCase())}</text></g>`);
  at += 0.3;
  out.push(`<g>${fadeIn(at, 0.4)}<text x="${x}" y="132" font-size="13" fill="${t.dim}">${esc(fit(profile.role, Math.floor((w - 2 * x) / cw(13))))}</text></g>`);

  // "[ OK ] " ocupa 7 colunas; a continuação repete a tag invisível como recuo, então alinha
  // com o texto em qualquer fonte (não depende da largura estimada do caractere)
  const cols = Math.floor((w - 2 * x) / cw(fs));
  let y = 166;
  at += 0.4;
  for (const line of boot) {
    const [first, ...rest] = wrap(line.text.replace(/ \.{4,} /, ' ... '), cols - 7, 3);
    const parts = [`<text x="${x}" y="${y}" font-size="${fs}" fill="${t.fg}">${bootTag(t, line)} ${esc(first)}</text>`];
    for (const l of rest) parts.push(`<text x="${x}" y="${(y += 20)}" font-size="${fs}" fill="${t.fg}"><tspan visibility="hidden">${bootTag(t, line)}</tspan> ${esc(l)}</text>`);
    out.push(`<g>${fadeIn(at, 0.15)}${parts.join('')}</g>`);
    y += 26;
    at += 0.32;
  }
  out.push(final(at, y));

  const r = 96, cy = y + 34 + r;
  const rad = radar(t, w / 2, cy, r, { blipFs: 11, countFs: 12.5 });
  return frame(t, {
    w,
    h: cy + r + 44,
    title: `${profile.login}.sec — boot.log`,
    right: 'tty1',
    body: out.join('\n') + '\n' + rad.join('\n'),
    fx: true,
  });
}

// ---------------------------------------------------------------- painel de ativos
function hostsPanel(t) {
  const { hosts } = data;
  const c = countBy(hosts);
  const out = [];
  const x = 26;
  // linha de resumo
  let sx = x;
  out.push(`<text x="${sx}" y="62" font-size="12" fill="${t.dim}" letter-spacing="1">MONITORED ASSETS</text>`);
  sx += 'MONITORED ASSETS'.length * cw(12) + 12 + 22;
  for (const st of Object.keys(STATUS_COLOR)) {
    if (!c[st]) continue;
    const col = t[STATUS_COLOR[st]];
    const label = `${c[st]} ${st.toLowerCase()}`;
    out.push(`<circle cx="${n(sx)}" cy="58" r="3.5" fill="${col}"/><text x="${n(sx + 9)}" y="62" font-size="12" fill="${t.fg}">${label}</text>`);
    sx += 9 + label.length * cw(12) + 20;
  }
  out.push(`<line x1="${x}" y1="78" x2="${W - x}" y2="78" stroke="${t.border}"/>`);

  let y = 104;
  const rowH = 50;
  hosts.forEach((h, i) => {
    const col = t[STATUS_COLOR[h.status]];
    const at = 0.2 + i * 0.12;
    const pill = h.status;
    const pw = pill.length * cw(11) + 18;
    const led = STATUS_BLINK[h.status]
      ? `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${col}">${blink(STATUS_BLINK[h.status])}</circle><circle cx="${x + 5}" cy="${y - 4}" r="9" fill="${col}" opacity="0.15"/>`
      : `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    const name = h.url ? `${h.name} ↗` : h.name;
    const stackTxt = h.stack.join(' / ');
    const stackMax = Math.floor((W - x - pw - 16 - 310) / cw(12));
    out.push(`<g>${fadeIn(at, 0.3)}
    ${led}
    <text x="${x + 22}" y="${y}" font-size="12" fill="${t.dim}">${esc(h.id)}</text>
    <text x="${x + 92}" y="${y}" font-size="14" font-weight="700" fill="${t.fg}">${esc(fit(name, 22))}</text>
    <text x="310" y="${y}" font-size="12" fill="${t.dim}">${esc(fit(stackTxt, stackMax))}</text>
    <rect x="${n(W - x - pw)}" y="${y - 15}" width="${n(pw)}" height="20" rx="4" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-opacity="0.6"/>
    <text x="${n(W - x - pw / 2)}" y="${y - 1}" font-size="11" font-weight="700" fill="${col}" text-anchor="middle" letter-spacing="0.5">${esc(pill)}</text>
    <text x="${x + 92}" y="${y + 20}" font-size="12" fill="${t.dim}"><tspan fill="${t.accent}">${esc(h.kind)}</tspan> · ${esc(fit(h.role, 72))}</text>
  </g>`);
    if (i < hosts.length - 1) out.push(`<line x1="${x}" y1="${y + rowH - 16}" x2="${W - x}" y2="${y + rowH - 16}" stroke="${t.border}" stroke-dasharray="2 4"/>`);
    y += rowH;
  });
  const h = y - rowH + 46;
  return frame(t, { h, title: 'asset-inventory — status board', right: `${hosts.length} hosts`, body: out.join('\n'), fx: true });
}

// ---------------------------------------------------------------- feed de eventos
async function publicEvents() {
  if (OFFLINE) return [];
  const headers = { 'User-Agent': 'profile-render', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // endpoint /events/public: mesmo com token só retorna eventos públicos.
  const res = await fetch(`https://api.github.com/users/${data.profile.login}/events/public?per_page=50`, { headers });
  if (!res.ok) {
    console.warn(`aviso: eventos públicos indisponíveis (${res.status}); seguindo só com o log manual`);
    return [];
  }
  const self = `${data.profile.login}/${data.profile.login}`;
  const out = [];
  for (const e of await res.json()) {
    if (!e.public || e.repo?.name === self) continue; // ignora commits do próprio render
    const repo = e.repo.name.split('/')[1];
    const p = e.payload || {};
    let msg = null;
    if (e.type === 'PushEvent') msg = p.size ? `pushed ${p.size} commit${p.size > 1 ? 's' : ''} to ${repo}` : `pushed to ${repo}`;
    else if (e.type === 'CreateEvent' && p.ref_type === 'repository') msg = `created repository ${repo}`;
    else if (e.type === 'PublicEvent') msg = `${repo} is now open source`;
    else if (e.type === 'ReleaseEvent') msg = `released ${p.release?.tag_name ?? ''} on ${repo}`;
    else if (e.type === 'PullRequestEvent' && p.pull_request?.merged) msg = `merged PR #${p.number} on ${repo}`;
    if (msg) out.push({ ts: e.created_at, level: 'INFO', host: 'GITHUB', msg });
  }
  return out;
}

function feed(t, events) {
  const rows = events.slice(0, 8);
  const x = 26;
  const out = [];
  const lvl = { INFO: t.ok, WARN: t.warn, CRIT: t.crit };
  let y = 62;
  out.push(`<text x="${x}" y="${y}" font-size="12" fill="${t.dim}">$ tail -f /var/log/${esc(data.profile.login)}/ops.log</text>`);
  y += 30;
  const col = { lvl: x + 18 * cw(12.5), host: x + 24 * cw(12.5), msg: x + 32 * cw(12.5) };
  const msgX = col.msg;
  const msgMax = Math.floor((W - x - msgX) / cw(12.5));
  rows.forEach((e, i) => {
    const ts = e.ts.slice(0, 16).replace('T', ' ');
    out.push(`<g>${fadeIn(0.3 + i * 0.18, 0.2)}<text x="${x}" y="${y}" font-size="12.5" fill="${t.dim}">${esc(ts)}</text><text x="${n(col.lvl)}" y="${y}" font-size="12.5" font-weight="700" fill="${lvl[e.level] || t.info}">${esc(e.level)}</text><text x="${n(col.host)}" y="${y}" font-size="12.5" fill="${t.accent}">${esc(e.host)}</text><text x="${n(msgX)}" y="${y}" font-size="12.5" fill="${t.fg}">${esc(fit(e.msg, msgMax))}</text></g>`);
    y += 24;
  });
  // barra de varredura descendo pelas linhas
  const top = 92 - 17, bottom = y - 24 + 7;
  out.push(`<rect x="${x - 8}" y="${top}" width="${W - 2 * x + 16}" height="24" fill="${t.accent}" opacity="0.07"><animate attributeName="y" values="${top};${bottom - 24};${top}" keyTimes="0;0.9;1" dur="7s" begin="2s" repeatCount="indefinite"/></rect>`);
  y += 2;
  out.push(`<text x="${x}" y="${y}" font-size="12.5" fill="${t.prompt}">▍<animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></text>`);
  return frame(t, { h: y + 22, title: 'event-stream — siem view', right: `<tspan fill="${t.crit}">●</tspan> LIVE`, body: out.join('\n'), fx: true });
}

// ---------------------------------------------------------------- stack
function stack(t) {
  const layers = data.stack;
  const cols = 3, gap = 14, x0 = 26;
  const cardW = (W - 2 * x0 - gap * (cols - 1)) / cols;
  const lineH = 20;
  const maxItems = Math.max(...layers.map((l) => l.items.length));
  const cardH = 44 + maxItems * lineH;
  const out = [];
  out.push(`<text x="${x0}" y="62" font-size="12" fill="${t.dim}">$ dpkg -l --installed-by=${esc(data.profile.login)}</text>`);
  layers.forEach((l, i) => {
    const cx = x0 + (i % cols) * (cardW + gap);
    const cy = 80 + Math.floor(i / cols) * (cardH + gap);
    const items = l.items.map((it, j) => `<text x="${n(cx + 16)}" y="${cy + 50 + j * lineH}" font-size="12.5" fill="${t.fg}"><tspan fill="${t.accent}">›</tspan> ${esc(fit(it, Math.floor((cardW - 36) / cw(12.5))))}</text>`).join('');
    out.push(`<g>${fadeIn(0.2 + i * 0.15, 0.3)}<rect x="${n(cx)}" y="${cy}" width="${n(cardW)}" height="${cardH}" rx="6" fill="${t.bg}" stroke="${t.border}"/>
    <text x="${n(cx + 16)}" y="${cy + 24}" font-size="11" font-weight="700" fill="${t.accent}" letter-spacing="1.5">${esc(l.layer)}</text>
    <line x1="${n(cx + 16)}" y1="${cy + 32}" x2="${n(cx + cardW - 16)}" y2="${cy + 32}" stroke="${t.border}"/>${items}</g>`);
  });
  const rowsN = Math.ceil(layers.length / cols);
  return frame(t, { h: 80 + rowsN * cardH + (rowsN - 1) * gap + 24, title: 'packages — installed stack', right: `${layers.reduce((s, l) => s + l.items.length, 0)} pkgs`, body: out.join('\n'), fx: true });
}

// ---------------------------------------------------------------- versões compactas (celular)
// Largura WM, fonte maior em relação à largura e uma coluna: em 375px o texto fica perto de 10px.
function hostsPanelM(t) {
  const { hosts } = data;
  const w = WM, x = 22;
  const c = countBy(hosts);
  const out = [];
  out.push(`<text x="${x}" y="60" font-size="12" fill="${t.dim}" letter-spacing="1">MONITORED ASSETS</text>`);
  // contadores em fluxo, quebrando linha quando não cabem
  let sx = x, sy = 84;
  for (const st of Object.keys(STATUS_COLOR)) {
    if (!c[st]) continue;
    const label = `${c[st]} ${st.toLowerCase()}`;
    const lw = 9 + label.length * cw(12.5);
    if (sx > x && sx + lw > w - x) (sx = x), (sy += 22);
    const col = t[STATUS_COLOR[st]];
    out.push(`<circle cx="${n(sx + 3.5)}" cy="${sy - 4}" r="3.5" fill="${col}"/><text x="${n(sx + 12.5)}" y="${sy}" font-size="12.5" fill="${t.fg}">${esc(label)}</text>`);
    sx += lw + 22;
  }
  let y = sy + 16;
  out.push(`<line x1="${x}" y1="${y}" x2="${w - x}" y2="${y}" stroke="${t.border}"/>`);
  y += 30;

  const cols = Math.floor((w - 2 * x - 22) / cw(13));
  hosts.forEach((h, i) => {
    const col = t[STATUS_COLOR[h.status]];
    const pw = h.status.length * cw(11) + 16;
    const led = STATUS_BLINK[h.status]
      ? `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${col}">${blink(STATUS_BLINK[h.status])}</circle><circle cx="${x + 5}" cy="${y - 5}" r="9" fill="${col}" opacity="0.15"/>`
      : `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    const nameX = x + 22 + 8 * cw(12);
    const nameMax = Math.floor((w - x - pw - 10 - nameX) / cw(15));
    const name = h.url ? `${h.name} ↗` : h.name;
    // linha 2: tipo + papel (até 2 linhas); linha 3: stack
    const [r1, ...rN] = wrap(`${h.kind} · ${h.role}`, cols, 2);
    const role = [`<text x="${x + 22}" y="${y + 23}" font-size="13" fill="${t.dim}"><tspan fill="${t.accent}">${esc(h.kind)}</tspan>${esc(r1.slice(h.kind.length))}</text>`];
    rN.forEach((l, j) => role.push(`<text x="${x + 22}" y="${y + 23 + (j + 1) * 19}" font-size="13" fill="${t.dim}">${esc(l)}</text>`));
    const sy3 = y + 23 + rN.length * 19 + 21;
    const stk = wrap(h.stack.join(' / '), Math.floor((w - 2 * x - 22) / cw(12.5)), 2).map((l, j) => `<text x="${x + 22}" y="${sy3 + j * 18}" font-size="12.5" fill="${t.idle}">${esc(l)}</text>`);
    out.push(`<g>${fadeIn(0.2 + i * 0.12, 0.3)}
    ${led}
    <text x="${x + 22}" y="${y}" font-size="12" fill="${t.dim}">${esc(h.id)}</text>
    <text x="${n(nameX)}" y="${y}" font-size="15" font-weight="700" fill="${t.fg}">${esc(fit(name, nameMax))}</text>
    <rect x="${n(w - x - pw)}" y="${y - 15}" width="${n(pw)}" height="20" rx="4" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-opacity="0.6"/>
    <text x="${n(w - x - pw / 2)}" y="${y - 1}" font-size="11" font-weight="700" fill="${col}" text-anchor="middle" letter-spacing="0.5">${esc(h.status)}</text>
    ${role.join('')}
    ${stk.join('')}
  </g>`);
    y = sy3 + (stk.length - 1) * 18 + 20;
    if (i < hosts.length - 1) out.push(`<line x1="${x}" y1="${y}" x2="${w - x}" y2="${y}" stroke="${t.border}" stroke-dasharray="2 4"/>`);
    y += 30;
  });
  return frame(t, { w, h: y - 6, title: 'asset-inventory — status board', right: `${hosts.length} hosts`, body: out.join('\n'), fx: true });
}

function feedM(t, events) {
  const rows = events.slice(0, 8);
  const w = WM, x = 22, fs = 13;
  const out = [];
  const lvl = { INFO: t.ok, WARN: t.warn, CRIT: t.crit };
  out.push(`<text x="${x}" y="60" font-size="12" fill="${t.dim}">$ tail -f /var/log/${esc(data.profile.login)}/ops.log</text>`);
  let y = 92;
  const top = y - 18;
  const cols = Math.floor((w - 2 * x) / cw(fs));
  rows.forEach((e, i) => {
    const ts = e.ts.slice(0, 16).replace('T', ' ');
    // linha 1: carimbo + nível + host no mesmo <text> (sem depender da largura da fonte)
    const head = `<text x="${x}" y="${y}" font-size="12.5" fill="${t.dim}">${esc(ts)} <tspan dx="6" font-weight="700" fill="${lvl[e.level] || t.info}">${esc(e.level)}</tspan> <tspan dx="6" fill="${t.accent}">${esc(e.host)}</tspan></text>`;
    const msg = wrap(e.msg, cols, 2).map((l, j) => `<text x="${x}" y="${y + 21 + j * 19}" font-size="${fs}" fill="${t.fg}">${esc(l)}</text>`);
    out.push(`<g>${fadeIn(0.3 + i * 0.18, 0.2)}${head}${msg.join('')}</g>`);
    y += 21 + (msg.length - 1) * 19 + 30;
  });
  // barra de varredura descendo pelas entradas
  const bottom = y - 30 + 8;
  out.push(`<rect x="${x - 8}" y="${top}" width="${w - 2 * x + 16}" height="44" fill="${t.accent}" opacity="0.07"><animate attributeName="y" values="${top};${bottom - 44};${top}" keyTimes="0;0.9;1" dur="8s" begin="2s" repeatCount="indefinite"/></rect>`);
  y -= 4;
  out.push(`<text x="${x}" y="${y}" font-size="${fs}" fill="${t.prompt}">▍<animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></text>`);
  return frame(t, { w, h: y + 22, title: 'event-stream — siem view', right: `<tspan fill="${t.crit}">●</tspan> LIVE`, body: out.join('\n'), fx: true });
}

function stackM(t) {
  const layers = data.stack;
  const w = WM, x0 = 22, gap = 12, fs = 13, lineH = 21;
  const cardW = w - 2 * x0, px = x0 + 14;
  const cols = Math.floor((cardW - 28) / cw(fs));
  const out = [];
  out.push(`<text x="${x0}" y="60" font-size="12" fill="${t.dim}">$ dpkg -l --installed-by=${esc(data.profile.login)}</text>`);
  let cy = 78;
  layers.forEach((l, i) => {
    // itens em fluxo, sem quebrar item; cada linha é um único <text> (não depende da largura da fonte)
    const lines = [];
    for (const it of l.items.map((s) => fit(s, cols - 2))) {
      const last = lines.at(-1);
      if (last && last.len + 3 + it.length + 2 <= cols) last.items.push(it), (last.len += 3 + it.length + 2);
      else lines.push({ items: [it], len: it.length + 2 });
    }
    const cardH = 44 + lines.length * lineH;
    const items = lines.map((ln, k) => `<text x="${px}" y="${cy + 54 + k * lineH}" font-size="${fs}" fill="${t.fg}">${ln.items.map((it, j) => `<tspan${j ? ' dx="14"' : ''} fill="${t.accent}">›</tspan> ${esc(it)}`).join(' ')}</text>`).join('');
    out.push(`<g>${fadeIn(0.2 + i * 0.15, 0.3)}<rect x="${x0}" y="${cy}" width="${cardW}" height="${cardH}" rx="6" fill="${t.bg}" stroke="${t.border}"/>
    <text x="${px}" y="${cy + 24}" font-size="11.5" font-weight="700" fill="${t.accent}" letter-spacing="1.5">${esc(l.layer)}</text>
    <line x1="${px}" y1="${cy + 33}" x2="${x0 + cardW - 14}" y2="${cy + 33}" stroke="${t.border}"/>${items}</g>`);
    cy += cardH + gap;
  });
  return frame(t, { w, h: cy - gap + 22, title: 'packages — installed stack', right: `${layers.reduce((s, l) => s + l.items.length, 0)} pkgs`, body: out.join('\n'), fx: true });
}

// ---------------------------------------------------------------- README (bloco gerado)
function linksBlock() {
  const live = data.hosts.filter((h) => h.url);
  const links = live.map((h) => `<a href="${esc(h.url)}"><code>${esc(h.name)}</code></a>`).join(' · ');
  return `<p align="center"><sub>live endpoints:</sub> ${links}<br><sub>most repos are private (client and product work). Ask me for a walkthrough.</sub></p>`;
}

async function updateReadme() {
  const file = path.join(OUT, 'README.md');
  if (!existsSync(file)) return;
  const md = await readFile(file, 'utf8');
  const next = md.replace(/(<!-- links:start -->)[\s\S]*?(<!-- links:end -->)/, `$1\n${linksBlock()}\n$2`);
  if (next !== md) await writeFile(file, next);
}

// ---------------------------------------------------------------- main
const events = [...data.log, ...(await publicEvents())].sort((a, b) => b.ts.localeCompare(a.ts));
await mkdir(path.join(OUT, 'assets'), { recursive: true });
const written = [];
for (const mode of Object.keys(THEMES[VARIANT])) {
  const t = THEMES[VARIANT][mode];
  const files = {
    hero: hero(t), hosts: hostsPanel(t), feed: feed(t, events), stack: stack(t),
    'hero-m': heroM(t), 'hosts-m': hostsPanelM(t), 'feed-m': feedM(t, events), 'stack-m': stackM(t),
  };
  for (const [name, svg] of Object.entries(files)) {
    const [base, suffix] = name.split('-'); // hero-m → assets/hero-dark-m.svg
    const f = path.join(OUT, 'assets', `${base}-${mode}${suffix ? `-${suffix}` : ''}.svg`);
    await writeFile(f, svg);
    written.push(`${path.relative(OUT, f)} (${svg.length} B)`);
  }
}
await updateReadme();
console.log(`variante ${VARIANT} → ${OUT}\n  ${written.join('\n  ')}`);
