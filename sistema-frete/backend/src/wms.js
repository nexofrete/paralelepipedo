// Ligação com o WMS (tela Pedidos, 405). Primeira etapa: o cadastro (endereço, usuário e senha, a senha
// criptografada como a dos portais das transportadoras) e o diagnóstico da conexão, que roda no servidor da
// empresa (o WMS fica na rede interna) e descreve como é a tela de login, sem enviar senha nenhuma: formulários e
// campos (só os nomes), tecnologia da página e os caminhos de API/autenticação citados nos scripts. Com isso e a
// gravação da consulta (HAR), a leitura dos dados do WMS é montada depois (src/pedidosWms.js grava em pedidos_wms).
const pool = require('./db');
const { criptografar } = require('./rastreioLonngren');

const falha = (m, status = 400) => Object.assign(new Error(m), { status });
const LIMITE_BYTES = 3 * 1024 * 1024;

async function config() {
  const { rows } = await pool.query('SELECT url, usuario, (senha IS NOT NULL) AS tem_senha, atualizado_em, ultimo_teste_em, ultimo_teste_ok FROM wms_config WHERE id = 1');
  return rows[0] || { url: '', usuario: '', tem_senha: false };
}

function urlValida(u) {
  let x;
  try { x = new URL(String(u || '').trim()); } catch (e) { throw falha('Endereço inválido. Ex.: http://10.150.15.66/auth/login'); }
  if (!['http:', 'https:'].includes(x.protocol)) throw falha('O endereço tem que começar com http:// ou https://');
  return x.toString();
}

async function salvarConfig(b = {}) {
  const url = urlValida(b.url);
  const usuario = String(b.usuario || '').trim().slice(0, 120) || null;
  const senha = b.senha ? criptografar(String(b.senha)) : null;
  await pool.query(`INSERT INTO wms_config (id, url, usuario, senha, atualizado_em) VALUES (1, $1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET url = $1, usuario = $2, senha = COALESCE($3, wms_config.senha), atualizado_em = NOW()`, [url, usuario, senha]);
  return config();
}

// ---------- Diagnóstico (sem banco, testável) ----------
const tirarTags = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, nome) => { const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null; };

function lerHtml(html) {
  const h = String(html || '');
  const titulo = tirarTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 150);
  const formularios = [];
  for (const m of h.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const campos = [];
    for (const c of m[2].matchAll(/<(input|select|textarea|button)\b([^>]*)>/gi)) {
      const tipo = (attr(c[2], 'type') || c[1]).toLowerCase();
      // Nada de valores: só nome, tipo e id (campo escondido com token também só aparece pelo nome).
      campos.push({ tag: c[1].toLowerCase(), tipo, nome: attr(c[2], 'name'), id: attr(c[2], 'id') });
    }
    formularios.push({ action: attr(m[1], 'action'), method: (attr(m[1], 'method') || 'get').toUpperCase(), id: attr(m[1], 'id'), campos });
  }
  const scripts = [...h.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 30);
  const pistas = [];
  const add = (cond, t) => { if (cond) pistas.push(t); };
  add(/__VIEWSTATE/i.test(h), 'ASP.NET WebForms (__VIEWSTATE)');
  add(/javax\.faces|jsf\.js/i.test(h), 'Java JSF');
  add(/ng-version|angular/i.test(h), 'Angular');
  add(/id=["'](root|__next)["']|react/i.test(h), 'React');
  add(/vue(\.min)?\.js|data-v-|id=["']app["']/i.test(h), 'Vue (ou app de página única)');
  add(/csrf|__RequestVerificationToken|_token/i.test(h), 'Formulário com token anti-CSRF');
  add(/<meta[^>]+generator/i.test(h), `Gerador: ${attr((h.match(/<meta[^>]+generator[^>]*>/i) || [''])[0], 'content') || '?'}`);
  add(/type=["']password["']/i.test(h), 'Tem campo de senha nesta página');
  return { titulo, formularios, scripts, pistas };
}

// Caminhos de API e de autenticação citados num script (ex.: "/api/expedicao", "/auth/login").
function caminhosApi(js) {
  const achados = new Set();
  for (const m of String(js || '').matchAll(/["'`](\/(?:api|auth|rest|services?|ws|v\d)\/[A-Za-z0-9_\-./{}:]{1,80})["'`]/g)) achados.add(m[1]);
  for (const m of String(js || '').matchAll(/["'`](https?:\/\/[A-Za-z0-9.\-:]+\/(?:api|auth|rest)[A-Za-z0-9_\-./]{0,80})["'`]/g)) achados.add(m[1]);
  return [...achados].sort().slice(0, 120);
}

async function baixar(url, { timeout = 10000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const inicio = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Nexofrete (diagnostico da integracao com o WMS)' } });
    const buf = Buffer.from(await r.arrayBuffer()).subarray(0, LIMITE_BYTES);
    return {
      status: r.status, ms: Date.now() - inicio, tipo: r.headers.get('content-type') || '', local: r.headers.get('location'),
      cookies: (r.headers.getSetCookie?.() || []).map((c) => c.split('=')[0]).filter(Boolean),
      servidor: [r.headers.get('server'), r.headers.get('x-powered-by')].filter(Boolean).join(' · '), corpo: buf.toString('utf8'),
    };
  } finally { clearTimeout(t); }
}

// Abre o endereço (seguindo até 5 redirecionamentos), lê a página e os scripts dela. Não envia usuário nem senha.
async function diagnosticar(urlInicial) {
  let url = urlValida(urlInicial);
  const passos = [];
  let pagina = null;
  for (let i = 0; i < 6; i++) {
    let r;
    try { r = await baixar(url); } catch (e) {
      passos.push({ url, erro: e.name === 'AbortError' ? 'o WMS não respondeu em 10 segundos' : e.message });
      return { ok: false, passos, texto: montarTexto({ passos }) };
    }
    passos.push({ url, status: r.status, ms: r.ms, tipo: r.tipo, cookies: r.cookies, servidor: r.servidor });
    if (r.status >= 300 && r.status < 400 && r.local) { url = new URL(r.local, url).toString(); continue; }
    pagina = r; break;
  }
  if (!pagina) return { ok: false, passos, texto: montarTexto({ passos }) };
  const ehJson = /json/i.test(pagina.tipo);
  const html = ehJson ? null : lerHtml(pagina.corpo);
  const apis = new Set(caminhosApi(pagina.corpo));
  const scripts = [];
  for (const src of (html?.scripts || []).filter((s) => !/^https?:\/\/(cdn|ajax|code|unpkg|cdnjs)/i.test(s)).slice(0, 8)) {
    try {
      const r = await baixar(new URL(src, url).toString(), { timeout: 8000 });
      const c = caminhosApi(r.corpo); c.forEach((x) => apis.add(x));
      scripts.push({ src, status: r.status, kb: Math.round(r.corpo.length / 1024), caminhos: c.length });
    } catch (e) { scripts.push({ src, erro: e.message }); }
  }
  const final = { passos, url_final: url, json: ehJson ? pagina.corpo.slice(0, 400) : null, html, scripts, apis: [...apis].sort().slice(0, 150) };
  return { ok: pagina.status < 400, ...final, texto: montarTexto(final) };
}

// Texto para copiar e enviar (sem senha, sem valores de campos, sem valores de cookies).
function montarTexto({ passos = [], url_final, json, html, scripts = [], apis = [] }) {
  const l = ['DIAGNOSTICO DA CONEXAO COM O WMS (sem senha)', ''];
  passos.forEach((p, i) => l.push(`${i + 1}. ${p.url} -> ${p.erro ? `ERRO: ${p.erro}` : `HTTP ${p.status} em ${p.ms} ms (${p.tipo || 'sem tipo'})${p.servidor ? ` servidor: ${p.servidor}` : ''}${p.cookies?.length ? ` cookies: ${p.cookies.join(', ')}` : ''}`}`));
  if (url_final) l.push('', `Página final: ${url_final}`);
  if (json) l.push(`Resposta JSON (início): ${json}`);
  if (html) {
    l.push(`Título: ${html.titulo || '-'}`, `Pistas: ${html.pistas.join('; ') || '-'}`);
    html.formularios.forEach((f, i) => {
      l.push(`Formulário ${i + 1}: ${f.method} ${f.action || '(mesma página)'}${f.id ? ` id=${f.id}` : ''}`);
      f.campos.forEach((c) => l.push(`   - ${c.tag} tipo=${c.tipo}${c.nome ? ` nome=${c.nome}` : ''}${c.id ? ` id=${c.id}` : ''}`));
    });
    if (!html.formularios.length) l.push('Nenhum formulário no HTML (a tela de login deve ser montada por script).');
  }
  if (scripts.length) { l.push('Scripts:'); scripts.forEach((s) => l.push(`   - ${s.src} ${s.erro ? `ERRO ${s.erro}` : `HTTP ${s.status}, ${s.kb} KB, ${s.caminhos} caminho(s)`}`)); }
  if (apis.length) { l.push('Caminhos de API/autenticação citados:'); apis.forEach((a) => l.push(`   ${a}`)); }
  return l.join('\n');
}

async function testar() {
  const c = await config();
  if (!c.url) throw falha('Cadastre o endereço do WMS primeiro.');
  const r = await diagnosticar(c.url);
  await pool.query('UPDATE wms_config SET ultimo_teste_em = NOW(), ultimo_teste_ok = $1 WHERE id = 1', [!!r.ok]);
  return r;
}

module.exports = { config, salvarConfig, diagnosticar, testar, lerHtml, caminhosApi, montarTexto, urlValida };
