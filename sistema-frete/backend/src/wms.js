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
  const { rows } = await pool.query(`SELECT url, url_expedicao, usuario, (senha IS NOT NULL) AS tem_senha, atualizado_em, ultimo_teste_em, ultimo_teste_ok, ativo, intervalo_min, hora_inicio, hora_fim, dias,
      to_char(ultima_consulta_em, 'YYYY-MM-DD HH24:MI') AS ultima_consulta_em, ultima_consulta_ok, ultima_consulta_msg FROM wms_config WHERE id = 1`);
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
  if (b.ativo !== undefined) {
    const n = (v, min, max, pad) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.min(Math.max(x, min), max) : pad; };
    await pool.query('UPDATE wms_config SET ativo = $1, intervalo_min = $2, hora_inicio = $3, hora_fim = $4, dias = $5 WHERE id = 1',
      [!!b.ativo, n(b.intervalo_min, 15, 720, 60), n(b.hora_inicio, 0, 23, 7), n(b.hora_fim, 1, 24, 19), n(b.dias, 1, 31, 7)]);
  }
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
// Mensagem de erro da tela de login (caixa de erro ou frase com "inválido", "incorreto", "bloqueado"...).
function avisoDoLogin(html) {
  const h = String(html || '');
  const caixa = tirarTags((h.match(/<(?:div|span|p|label|td|font|strong|b)[^>]*(?:erro|error|alert|mensagem|msg|aviso|warning|danger)[^>]*>([\s\S]{0,400}?)<\/(?:div|span|p|label|td|font|strong|b)>/i) || [])[1]);
  if (caixa) return caixa.slice(0, 200);
  const frase = tirarTags(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')).match(/[^.!?]{0,80}(inv[aá]lid|incorret|bloquead|expirad|n[aã]o encontrad|n[aã]o autorizad|tentativas)[^.!?]{0,80}/i);
  if (frase) return frase[0].trim().slice(0, 200);
  const alerta = h.match(/alert\(\s*['"]([^'"]{3,200})['"]/i);
  return alerta ? alerta[1] : '';
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
    // Nunca 401: na tela do Nexofrete, 401 quer dizer "a SUA sessão expirou" e tira o usuário do sistema.
    const aviso = avisoDoLogin(r.corpo);
    const detalhe = `HTTP ${r.status}, voltou para ${r.url}; campos enviados: ${Object.keys(dados).join(', ')}; cookies: ${[...s.cookies.keys()].join(', ') || 'nenhum'}`;
    throw falha(`O WMS não aceitou o login${aviso ? `: "${aviso}"` : ' (sem mensagem de erro na tela; confira o usuário e a senha)'}. Detalhe: ${detalhe}.`, 422);
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

// ---------- Consulta automática: tela Expedição Mercadorias (Imperium) ----------
// Lê a tabela "grid-expedicao" pelos títulos das colunas. Uma linha por expedição; a coluna Cargas traz o(s)
// pedido(s) do ERP. Devolve também o "Total de N registros" da página, para saber se veio tudo.
function lerGrid(html) {
  const h = String(html || '');
  const tabelas = [...h.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  const alvo = tabelas.find((t) => /grid-expedicao/i.test(t[1])) || tabelas.find((t) => /<th\b[^>]*>[\s\S]*?Cargas/i.test(t[2]));
  const totalTxt = tirarTags(h).match(/Total de\s+([\d.]+)\s+registros?/i);
  const total = totalTxt ? Number(totalTxt[1].replace(/\./g, '')) : null;
  if (!alvo) return { linhas: [], total, sem_tabela: true };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  const trs = [...alvo[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => ({ th: c[1].toLowerCase() === 'th', txt: tirarTags(c[2]) })));
  const iCab = trs.findIndex((r) => r.some((c) => norm(c.txt) === 'cargas'));
  if (iCab < 0) return { linhas: [], total, sem_tabela: true };
  const cab = trs[iCab].map((c) => norm(c.txt));
  const col = (...nomes) => cab.findIndex((x) => nomes.includes(x));
  const C = { exp: col('expedicao'), cargas: col('cargas'), tipo: col('tipo pedido'), cub: col('cubagem'), peso: col('peso'), qtd: col('qtd ped'), placa: col('placa'),
    itin: col('itinerarios', 'itinerario'), mot: col('motorista'), ini: col('data inicial'), fim: col('data final'), imp: col('imprimir'), conf: col('% conferencia', 'conferencia'), st: col('status') };
  const { dataHora, numeroBr } = require('./pedidosWms');
  const v = (r, i) => (i >= 0 && r[i] ? r[i].txt.trim() : '') || null;
  const linhas = [];
  for (const r of trs.slice(iCab + 1)) {
    if (r.length < cab.length - 1 || r.every((c) => c.th)) continue;
    const cargas = String(v(r, C.cargas) || '').split(/[^\d]+/).filter(Boolean);
    if (!cargas.length) continue;
    const imp = String(v(r, C.imp) || '').toUpperCase();
    linhas.push({ expedicao_numero: v(r, C.exp), cargas, tipo_pedido: v(r, C.tipo), cubagem: numeroBr(v(r, C.cub)), peso: numeroBr(v(r, C.peso)), qtd_pedidos: numeroBr(v(r, C.qtd)),
      placa: v(r, C.placa), itinerario: v(r, C.itin), motorista: v(r, C.mot), data_inicial: dataHora(v(r, C.ini)), expedicao_fim: dataHora(v(r, C.fim)),
      imprimir: imp === 'SIM' ? true : imp === 'NAO' || imp === 'NÃO' ? false : null, conferencia_pct: numeroBr(v(r, C.conf)), status: v(r, C.st) });
  }
  return { linhas, total };
}

// Linhas do grid → pedidos_wms (uma por carga = pedido). "SEM TRANSPORTADORA 25-11-2026" na Placa não é placa.
function paraPedidos(linhas) {
  const out = [];
  for (const l of linhas) {
    const placa = l.placa && /^SEM\b/i.test(l.placa) ? null : l.placa;
    for (const carga of l.cargas) {
      out.push({ numero_pedido: carga, status: l.status, data_inicial: l.data_inicial, expedicao_numero: l.expedicao_numero, tipo_pedido: l.tipo_pedido, placa,
        motorista: l.motorista, itinerario: l.itinerario, expedicao_fim: l.expedicao_fim, conferencia_pct: l.conferencia_pct, imprimir: l.imprimir,
        cancelado: /CANCELAD/i.test(l.status || '') ? true : (l.status ? false : null) });
    }
  }
  return out;
}

const dataBr = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
// Endereço da busca: o da tela copiada do navegador, com o período trocado e os outros filtros limpos.
function urlBusca(c, de, ate) {
  const base = new URL(c.url_expedicao || '/expedicao?submit=Buscar&control=roll', c.url);
  const u = new URL(base.pathname, base);
  const p = new URLSearchParams(base.search);
  for (const k of ['idExpedicao', 'dataFinal1', 'dataFinal2', 'status', 'codCargaExterno', 'placa', 'pedido', 'produto']) p.set(k, '');
  p.set('submit', p.get('submit') || 'Buscar'); p.set('control', p.get('control') || 'roll');
  p.set('dataInicial1', dataBr(de)); p.set('dataInicial2', dataBr(ate));
  u.search = p.toString();
  return u.toString();
}

let consultando = false;
// Faz o login, busca as expedições dos últimos N dias (pela Data Inicial) e grava em pedidos_wms.
async function consultar({ origem = 'manual' } = {}) {
  if (consultando) throw falha('Já tem uma consulta ao WMS em andamento. Espere um pouco.', 409);
  consultando = true;
  const inicio = Date.now();
  const registrar = (ok, msg, qtd = null) => pool.query('UPDATE wms_config SET ultima_consulta_em = NOW(), ultima_consulta_ok = $1, ultima_consulta_msg = $2, ultima_consulta_qtd = $3, ultima_consulta_ms = $4 WHERE id = 1',
    [ok, String(msg).slice(0, 500), qtd, Date.now() - inicio]).catch(() => null);
  try {
    const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
    if (!c) throw falha('Cadastre a ligação com o WMS.');
    const dias = Math.min(Math.max(Number(c.dias) || 7, 1), 31);
    const hoje = new Date(Date.now() - 3 * 3600000); const de = new Date(hoje.getTime() - (dias - 1) * 86400000);
    const { sessao } = await entrar(c);
    const pg = await sessao.pedir(urlBusca(c, de, hoje), { timeout: 60000 });
    if (temSenha(pg.corpo)) throw falha('O WMS voltou para o login na busca (a sessão não foi aceita).', 502);
    const g = lerGrid(pg.corpo);
    if (g.sem_tabela) throw falha('A tela de expedição do WMS não trouxe a tabela de resultados (a tela pode ter mudado).', 502);
    const pedidos = paraPedidos(g.linhas);
    const gravados = await require('./pedidosWms').gravar(pedidos, 'wms');
    const incompleto = g.total != null && g.total > g.linhas.length;
    const msg = `${g.linhas.length} expedição(ões) de ${dataBr(de)} a ${dataBr(hoje)}, ${pedidos.length} pedido(s) atualizados`
      + `${incompleto ? `. ATENÇÃO: o WMS diz ${g.total} registros e vieram ${g.linhas.length} (a tela pode estar paginando)` : ''} (${origem}, ${Math.round((Date.now() - inicio) / 100) / 10} s)`;
    await registrar(true, msg, pedidos.length);
    return { ok: true, expedicoes: g.linhas.length, pedidos: pedidos.length, gravados, total_wms: g.total, incompleto, msg };
  } catch (e) {
    await registrar(false, e.message);
    throw e;
  } finally { consultando = false; }
}

// Situação da ligação (para a tela Pedidos: "WMS atualizado às...").
async function situacao() {
  const { rows: [c] } = await pool.query(`SELECT ativo, intervalo_min, hora_inicio, hora_fim, ultima_consulta_ok, ultima_consulta_msg, ultima_consulta_qtd,
      to_char(ultima_consulta_em, 'YYYY-MM-DD HH24:MI') AS ultima_consulta_em, (url IS NOT NULL AND senha IS NOT NULL) AS configurado FROM wms_config WHERE id = 1`).catch(() => ({ rows: [] }));
  return c || { configurado: false, ativo: false };
}

// Agendamento: confere a cada 5 minutos se está ligado, dentro do horário e se já passou o intervalo.
let tarefa = null;
async function talvezConsultar() {
  // Minutos desde a última consulta e a hora de Brasília calculados no banco (o mesmo relógio que gravou a consulta).
  const { rows: [c] } = await pool.query(`SELECT ativo, intervalo_min, hora_inicio, hora_fim, ultima_consulta_ok,
      EXTRACT(EPOCH FROM (NOW() - ultima_consulta_em)) / 60 AS minutos, EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::int AS hora
    FROM wms_config WHERE id = 1`).catch(() => ({ rows: [] }));
  if (!c?.ativo) return false;
  if (c.hora < Number(c.hora_inicio) || c.hora >= Number(c.hora_fim)) return false;
  // Depois de uma falha, espera o dobro do intervalo (não insiste com o WMS fora do ar ou lento).
  const intervalo = Math.max(Number(c.intervalo_min) || 60, 15) * (c.ultima_consulta_ok === false ? 2 : 1);
  if (c.minutos != null && Number(c.minutos) < intervalo - 0.5) return false;
  await consultar({ origem: 'automático' }).catch((e) => console.error('[wms]', e.message));
  return true;
}
function agendar() {
  if (tarefa) return;
  tarefa = require('node-cron').schedule('*/5 * * * *', () => { talvezConsultar().catch(() => null); });
}

// Pausar / retomar a integração (botão da tela Pedidos): pausada, nem a consulta automática nem o
// "Atualizar do WMS" falam com o WMS. O teste da janela Ligação com o WMS continua liberado.
async function pausar(ativo) {
  const { rowCount } = await pool.query('UPDATE wms_config SET ativo = $1 WHERE id = 1', [!!ativo]);
  if (!rowCount) throw falha('Cadastre a ligação com o WMS primeiro.');
  return situacao();
}

async function testar() {
  const c = await config();
  if (!c.url) throw falha('Cadastre o endereço do WMS primeiro.');
  const r = await diagnosticar(c.url);
  await pool.query('UPDATE wms_config SET ultimo_teste_em = NOW(), ultimo_teste_ok = $1 WHERE id = 1', [!!r.ok]);
  return r;
}

module.exports = { pausar, lerGrid, paraPedidos, urlBusca, consultar, situacao, talvezConsultar, agendar, avisoDoLogin, config, salvarConfig, diagnosticar, testar, testarTela, entrar, Sessao, descreverTela, textoTela, lerHtml, caminhosApi, montarTexto, urlValida };
