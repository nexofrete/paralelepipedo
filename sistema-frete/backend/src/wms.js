// Ligação com o WMS (tela Pedidos, 405). Primeira etapa: o cadastro (endereço, usuário e senha, a senha
// criptografada como a dos portais das transportadoras) e o diagnóstico da conexão, que roda no servidor da
// empresa (o WMS fica na rede interna) e descreve como é a tela de login, sem enviar senha nenhuma: formulários e
// campos (só os nomes), tecnologia da página e os caminhos de API/autenticação citados nos scripts. Com isso e a
// gravação da consulta (HAR), a leitura dos dados do WMS é montada depois (src/pedidosWms.js grava em pedidos_wms).
// Segunda etapa: o WMS é o Imperium (PHP, login por formulário em /auth/login com username/password e sessão no
// cookie PHPSESSID). Sessao faz o login como o navegador e testarTela() abre a tela Expedição Mercadorias e descreve
// os filtros e as colunas da tabela, sem os dados.
const pool = require('./db');
const { criptografar, descriptografar } = require('./rastreioLonngren');

const falha = (m, status = 400) => Object.assign(new Error(m), { status });
const LIMITE_BYTES = 3 * 1024 * 1024;

async function config() {
  const { rows } = await pool.query('SELECT url, url_expedicao, usuario, (senha IS NOT NULL) AS tem_senha, atualizado_em, ultimo_teste_em, ultimo_teste_ok FROM wms_config WHERE id = 1');
  return rows[0] || { url: '', url_expedicao: '', usuario: '', tem_senha: false };
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
  const tela = String(b.url_expedicao || '').trim() ? urlValida(b.url_expedicao) : null;
  await pool.query(`INSERT INTO wms_config (id, url, usuario, senha, url_expedicao, atualizado_em) VALUES (1, $1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET url = $1, usuario = $2, senha = COALESCE($3, wms_config.senha), url_expedicao = $4, atualizado_em = NOW()`, [url, usuario, senha, tela]);
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

// ---------- Sessão no WMS: login como o navegador (cookies e redirecionamentos) ----------
class Sessao {
  constructor() { this.cookies = new Map(); }
  cabecalhoCookie() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  guardar(r) { for (const c of r.headers.getSetCookie?.() || []) { const [par] = c.split(';'); const i = par.indexOf('='); if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim()); } }
  async pedir(url, { metodo = 'GET', form = null, timeout = 15000 } = {}) {
    let atual = url; let corpo = form ? new URLSearchParams(form).toString() : null; let m = metodo;
    for (let i = 0; i < 6; i++) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      let r;
      try {
        r = await fetch(atual, { method: m, redirect: 'manual', signal: ctl.signal, body: corpo,
          headers: { 'User-Agent': 'Nexofrete (consulta do WMS)', ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(this.cookies.size ? { Cookie: this.cabecalhoCookie() } : {}) } });
      } catch (e) { throw falha(e.name === 'AbortError' ? 'O WMS não respondeu a tempo.' : `Não consegui falar com o WMS: ${e.message}`, 502); } finally { clearTimeout(t); }
      this.guardar(r);
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { atual = new URL(r.headers.get('location'), atual).toString(); m = 'GET'; corpo = null; continue; }
      const buf = Buffer.from(await r.arrayBuffer()).subarray(0, LIMITE_BYTES);
      const tipo = r.headers.get('content-type') || '';
      const texto = /iso-8859-1|latin1|windows-1252/i.test(tipo) ? buf.toString('latin1') : buf.toString('utf8');
      return { url: atual, status: r.status, tipo, corpo: texto };
    }
    throw falha('O WMS redirecionou vezes demais.', 502);
  }
}
const temSenha = (html) => /<input[^>]+type\s*=\s*["']?password/i.test(html || '');

// Login: lê o formulário da tela de login (campos escondidos, usuário, senha e o botão) e envia como o navegador.
async function entrar(c) {
  if (!c.url) throw falha('Cadastre o endereço do WMS.');
  if (!c.usuario || !c.senha) throw falha('Cadastre o usuário e a senha do WMS.');
  const s = new Sessao();
  const pg = await s.pedir(c.url);
  const form = [...pg.corpo.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].find((f) => temSenha(f[2]));
  if (!form) throw falha('A página de login do WMS não tem o formulário com senha.', 502);
  const dados = {};
  let campoUsuario = null; let campoSenha = null;
  for (const i of form[2].matchAll(/<input\b([^>]*)>/gi)) {
    const nome = attr(i[1], 'name'); if (!nome) continue;
    const tipo = (attr(i[1], 'type') || 'text').toLowerCase();
    if (tipo === 'password') campoSenha = nome;
    else if (['text', 'email'].includes(tipo) && !campoUsuario) campoUsuario = nome;
    else if (tipo === 'hidden' || tipo === 'submit') dados[nome] = attr(i[1], 'value') ?? '';
  }
  if (!campoUsuario || !campoSenha) throw falha('Não achei os campos de usuário e senha no login do WMS.', 502);
  dados[campoUsuario] = c.usuario; dados[campoSenha] = descriptografar(c.senha);
  const destino = new URL(attr(form[1], 'action') || c.url, pg.url).toString();
  const r = await s.pedir(destino, { metodo: (attr(form[1], 'method') || 'post').toUpperCase(), form: dados });
  if (temSenha(r.corpo)) {
    const aviso = tirarTags((r.corpo.match(/<(?:div|span|p|label)[^>]*(?:erro|error|alert|mensagem|msg)[^>]*>([\s\S]{0,300}?)<\/(?:div|span|p|label)>/i) || [])[1]).slice(0, 160);
    throw falha(`O WMS não aceitou o login${aviso ? `: ${aviso}` : ' (confira o usuário e a senha)'}.`, 401);
  }
  return { sessao: s, depois: r.url };
}

// Descreve uma tela sem os dados: filtros (nomes, rótulos, opções), tabelas (títulos e quantas linhas),
// botões de exportar e frames. Testável sem banco.
function descreverTela(html) {
  const h = String(html || '');
  const rotulos = new Map([...h.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi)].map((m) => [m[1], tirarTags(m[2])]));
  const formularios = [...h.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => {
    const campos = [];
    // Campos na ordem da página; o <select> com as opções dele (sem engolir os campos seguintes).
    const achados = [...m[2].matchAll(/<(input|textarea|button)\b([^>]*)>/gi), ...[...m[2].matchAll(/<(select)\b([^>]*)>([\s\S]*?)<\/select>/gi)].map((x) => Object.assign(x, { 3: `${x[3]}</select>` }))]
      .sort((a, b) => a.index - b.index);
    for (const c of achados) {
      const id = attr(c[2], 'id'); const nome = attr(c[2], 'name');
      const tipo = (attr(c[2], 'type') || c[1]).toLowerCase();
      if (!nome && !id && !['submit', 'button'].includes(tipo)) continue;
      const antes = tirarTags(m[2].slice(0, c.index).slice(-160)).split(/\s{2,}|:\s/).filter(Boolean).pop() || '';
      const opcoes = c[1].toLowerCase() === 'select' ? [...(c[3] || '').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].slice(0, 15).map((o) => `${attr(o[1], 'value') ?? ''}=${tirarTags(o[2])}`) : null;
      campos.push({ tipo, nome, id, rotulo: ['submit', 'button'].includes(tipo) ? '' : ((id && rotulos.get(id)) || antes.slice(-40)), valor_botao: ['submit', 'button'].includes(tipo) ? attr(c[2], 'value') : null, opcoes });
    }
    return { action: attr(m[1], 'action'), method: (attr(m[1], 'method') || 'get').toUpperCase(), id: attr(m[1], 'id'), nome: attr(m[1], 'name'), campos };
  });
  const tabelas = [...h.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].map((m) => {
    const linhas = [...m[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const th = linhas.find((l) => /<th\b/i.test(l[1])) || linhas[0];
    const titulos = th ? [...th[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) => tirarTags(x[1])) : [];
    return { id: attr(m[1], 'id'), classe: attr(m[1], 'class'), titulos, linhas: Math.max(0, linhas.length - 1) };
  }).filter((t) => t.titulos.filter(Boolean).length >= 3);
  const exportar = [...h.matchAll(/<(a|button|input)\b([^>]*)>([\s\S]{0,80}?)(?:<\/\1>)?/gi)]
    .filter((m) => /export/i.test(m[2] + m[3]))
    .map((m) => `${m[1]} ${['href', 'onclick', 'name', 'id', 'value', 'formaction'].map((a) => (attr(m[2], a) ? `${a}=${attr(m[2], a).slice(0, 120)}` : '')).filter(Boolean).join(' ')}`).slice(0, 10);
  const frames = [...h.matchAll(/<i?frame\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const titulo = tirarTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 150);
  return { titulo, formularios, tabelas, exportar, frames };
}

function textoTela(t, url, depois) {
  const l = ['DIAGNOSTICO DA TELA DE EXPEDICAO DO WMS (sem senha e sem dados)', '', `Login: ok (depois do login: ${depois})`, `Tela: ${url}`, `Título: ${t.titulo || '-'}`];
  if (t.frames.length) l.push(`Frames: ${t.frames.join(', ')}`);
  t.formularios.forEach((f, i) => {
    l.push(`Formulário ${i + 1}: ${f.method} ${f.action || '(mesma página)'}${f.id ? ` id=${f.id}` : ''}${f.nome ? ` name=${f.nome}` : ''}`);
    f.campos.forEach((c) => l.push(`   - ${c.tipo}${c.nome ? ` nome=${c.nome}` : ''}${c.id ? ` id=${c.id}` : ''}${c.rotulo ? ` rótulo="${c.rotulo}"` : ''}${c.valor_botao ? ` botão="${c.valor_botao}"` : ''}${c.opcoes ? ` opções: ${c.opcoes.join(' | ')}` : ''}`));
  });
  t.tabelas.forEach((x, i) => l.push(`Tabela ${i + 1}${x.id ? ` id=${x.id}` : ''}${x.classe ? ` class=${x.classe}` : ''}: ${x.linhas} linha(s); colunas: ${x.titulos.join(' | ')}`));
  if (!t.tabelas.length) l.push('Nenhuma tabela de resultado na tela.');
  if (t.exportar.length) { l.push('Exportar:'); t.exportar.forEach((e) => l.push(`   ${e}`)); }
  return l.join('\n');
}

// Faz o login e abre a tela de expedição (endereço copiado do navegador, de preferência depois de buscar uma carga).
async function testarTela() {
  const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
  if (!c?.url_expedicao) throw falha('Cadastre o endereço da tela Expedição Mercadorias (copie da barra do navegador).');
  const { sessao, depois } = await entrar(c);
  const pg = await sessao.pedir(c.url_expedicao);
  if (temSenha(pg.corpo)) throw falha('O login funcionou, mas a tela de expedição voltou para o login (a sessão não foi aceita).', 502);
  const t = descreverTela(pg.corpo);
  await pool.query('UPDATE wms_config SET ultimo_teste_em = NOW(), ultimo_teste_ok = TRUE WHERE id = 1');
  return { ok: true, http: pg.status, texto: textoTela(t, pg.url, depois), ...t };
}

async function testar() {
  const c = await config();
  if (!c.url) throw falha('Cadastre o endereço do WMS primeiro.');
  const r = await diagnosticar(c.url);
  await pool.query('UPDATE wms_config SET ultimo_teste_em = NOW(), ultimo_teste_ok = $1 WHERE id = 1', [!!r.ok]);
  return r;
}

module.exports = { config, salvarConfig, diagnosticar, testar, testarTela, entrar, Sessao, descreverTela, textoTela, lerHtml, caminhosApi, montarTexto, urlValida };
