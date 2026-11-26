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
  const { rows } = await pool.query(`SELECT url, url_expedicao, usuario, (senha IS NOT NULL) AS tem_senha, atualizado_em, ultimo_teste_em, ultimo_teste_ok, ativo, intervalo_min, hora_inicio, hora_fim, dias, por_carga_max,
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
    await pool.query('UPDATE wms_config SET ativo = $1, intervalo_min = $2, hora_inicio = $3, hora_fim = $4, dias = $5, por_carga_max = $6 WHERE id = 1',
      [!!b.ativo, n(b.intervalo_min, 15, 720, 60), n(b.hora_inicio, 0, 23, 7), n(b.hora_fim, 1, 24, 19), n(b.dias, 1, 31, 7), n(b.por_carga_max, 0, 200, 40)]);
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
  return { linhas, total, resumo: lerResumo(h) };
}

// Quadro "Resumo" da tela (Expedições, Qtd. Etq. Válidas, Qtd. Etq. Reentrega, Qtd. Pedidos, Qtd. Produtos, Qtd. Volumes):
// os valores ficam em campos (input) ou no texto da linha de baixo. Na busca por uma carga, é o resumo daquele pedido.
function lerResumo(html) {
  const t = [...String(html || '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].find((m) => /Qtd\.?\s*Etq/i.test(m[1]));
  if (!t) return null;
  const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1]));
  const iCab = trs.findIndex((r) => r.some((c) => /Qtd\.?\s*Etq/i.test(tirarTags(c))));
  if (iCab < 0 || !trs[iCab + 1]) return null;
  const valor = (c) => { const v = attr((c.match(/<input\b[^>]*>/i) || [''])[0], 'value'); return (v ?? tirarTags(c)).trim(); };
  const out = {};
  trs[iCab].forEach((c, i) => { const k = tirarTags(c).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); out[k] = valor(trs[iCab + 1][i] || ''); });
  const n = (k) => { const v = require('./pedidosWms').numeroBr(out[k]); return v == null ? null : v; };
  return { expedicoes: n('expedicoes'), etq_validas: n('qtd etq validas'), etq_reentrega: n('qtd etq reentrega'), pedidos: n('qtd pedidos'), produtos: n('qtd produtos'), volumes: n('qtd volumes') };
}

// OS da expedição (/expedicao/os/index/id/<nº da expedição>): quem imprimiu as etiquetas e quando ("NOME" e, ao lado, a data).
// Tenta, nesta ordem: um rótulo de impressão ("Impresso por", "Usuário impressão"...) seguido do nome e da data; uma tabela com
// colunas de usuário e de data; e, por fim, o primeiro "NOME dd/mm/aaaa hh:mm" perto da palavra etiqueta/impressão.
const DATA_HORA = String.raw`(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)`;
const NOME = String.raw`([A-ZÀ-Ý][A-Za-zÀ-ÿ.'\- ]{2,60}?)`;
function lerImpressao(html) {
  const { dataHora } = require('./pedidosWms');
  const h = String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const texto = h.replace(/<\/(td|th|div|p|li|tr|label|span)>/gi, ' | ').replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');
  const limpo = (n) => String(n || '').replace(/[|:]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Histórico da OS (Imperium: tabela Data | Usuário | Mapa | Etiqueta | Andamento): a linha "Etiquetas Impressas".
  // Com reimpressão, vale a primeira impressão (a data mais antiga).
  const tabelas = [...h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((x) => [...x[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => tirarTags(c[1]))));
  let temHistorico = false;
  for (const trs of tabelas) {
    const iCab = trs.findIndex((r) => r.some((c) => /^andamento$/i.test(c)) && r.some((c) => /usu[aá]rio/i.test(c)) && r.some((c) => /^data$/i.test(c)));
    if (iCab < 0) continue;
    temHistorico = true;
    const cab = trs[iCab];
    const iU = cab.findIndex((c) => /usu[aá]rio/i.test(c)); const iD = cab.findIndex((c) => /^data$/i.test(c)); const iA = cab.findIndex((c) => /^andamento$/i.test(c));
    const impressoes = trs.slice(iCab + 1).filter((x) => /etiquetas?\s+impress/i.test(x[iA] || '') && dataHora(x[iD]))
      .map((x) => ({ usuario: limpo(x[iU]), impresso_em: dataHora(x[iD]) })).sort((a, b) => a.impresso_em.localeCompare(b.impresso_em));
    if (impressoes.length) return { ...impressoes[0], como: `histórico: "Etiquetas Impressas"${impressoes.length > 1 ? ` (1ª de ${impressoes.length} impressões)` : ''}` };
  }
  // Tem o histórico, mas ainda sem "Etiquetas Impressas": as etiquetas não foram impressas (não procura em outro lugar).
  if (temHistorico) return null;
  let m = texto.match(new RegExp(String.raw`(?:impress[aã]o|imprimiu|impresso\s+por|usu[aá]rio\s+(?:da\s+)?impress[aã]o|usu[aá]rio\s+etiqueta)[^|\d]{0,30}[|:\s]+${NOME}\s*[|\-–]?\s*${DATA_HORA}`, 'i'));
  if (m) return { usuario: limpo(m[1]), impresso_em: dataHora(m[2]), como: 'rótulo de impressão' };
  for (const t of h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => [...x[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => tirarTags(c[1])));
    const iCab = trs.findIndex((r) => r.some((c) => /usu[aá]rio|impress/i.test(c)) && r.some((c) => /data/i.test(c)));
    // Histórico de andamento sem "Etiquetas Impressas": não chuta outra linha (seria outro evento, outra pessoa).
    if (iCab < 0 || trs[iCab].some((c) => /^andamento$/i.test(c))) continue;
    const iU = trs[iCab].findIndex((c) => /usu[aá]rio|impress/i.test(c)); const iD = trs[iCab].findIndex((c) => /data/i.test(c));
    const linha = trs.slice(iCab + 1).find((r) => r[iU] && dataHora(r[iD]));
    if (linha) return { usuario: limpo(linha[iU]), impresso_em: dataHora(linha[iD]), como: 'tabela usuário/data' };
  }
  m = texto.match(new RegExp(String.raw`(?:etiqueta|impress)[\s\S]{0,200}?\|\s*${NOME}\s*\|?\s*${DATA_HORA}`, 'i'));
  if (m) return { usuario: limpo(m[1]), impresso_em: dataHora(m[2]), como: 'nome e data perto de "etiqueta"' };
  return null;
}
// Separação na OS: quem separou (Separador) e o início e o fim, com data e hora.
//  1) tabela de atividades (OS | Responsavel | Atividade | ... | Inicio | Fim): as linhas de atividade "separação";
//  2) senão, o histórico (Data | Usuário | ... | Andamento): as linhas de separação (iniciada / finalizada).
// Mais de um separador: os nomes juntos, o início mais cedo e o fim mais tarde.
function lerSeparacao(html) {
  const { dataHora } = require('./pedidosWms');
  const h = String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const tabelas = [...h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((x) => [...x[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => tirarTags(c[1]))));
  const limpo = (n) => String(n || '').replace(/\s+/g, ' ').trim();
  const juntar = (linhas, como) => {
    const nomes = [...new Set(linhas.map((l) => l.nome).filter(Boolean))];
    const ini = linhas.map((l) => l.ini).filter(Boolean).sort()[0] || null;
    const fim = linhas.map((l) => l.fim).filter(Boolean).sort().pop() || null;
    return nomes.length || ini || fim ? { separador: nomes.join(', ') || null, sep_inicio: ini, sep_fim: fim, como_sep: como } : null;
  };
  const atividades = new Set();
  for (const trs of tabelas) {
    const iCab = trs.findIndex((r) => r.some((c) => /^respons[aá]vel$/i.test(c)) && r.some((c) => /^atividade$/i.test(c)));
    if (iCab < 0) continue;
    const cab = trs[iCab];
    const iR = cab.findIndex((c) => /^respons[aá]vel$/i.test(c)); const iA = cab.findIndex((c) => /^atividade$/i.test(c));
    const iI = cab.findIndex((c) => /^in[ií]cio$/i.test(c)); const iF = cab.findIndex((c) => /^fim$/i.test(c));
    const linhas = trs.slice(iCab + 1).filter((x) => x.length >= cab.length - 1);
    linhas.forEach((x) => { if (x[iA]) atividades.add(limpo(x[iA])); });
    const sep = linhas.filter((x) => /separa/i.test(x[iA] || '')).map((x) => ({ nome: limpo(x[iR]), ini: dataHora(x[iI]), fim: dataHora(x[iF]) }));
    const r = juntar(sep, 'tabela de atividades (separação)');
    if (r) return { ...r, atividades: [...atividades] };
  }
  for (const trs of tabelas) {
    const iCab = trs.findIndex((r) => r.some((c) => /^andamento$/i.test(c)) && r.some((c) => /usu[aá]rio/i.test(c)) && r.some((c) => /^data$/i.test(c)));
    if (iCab < 0) continue;
    const cab = trs[iCab];
    const iU = cab.findIndex((c) => /usu[aá]rio/i.test(c)); const iD = cab.findIndex((c) => /^data$/i.test(c)); const iA = cab.findIndex((c) => /^andamento$/i.test(c));
    // Só andamento que é claramente da separação ("Separação iniciada", "Fim da separação"...). "Etiqueta de separação",
    // "conferência da separação" e afins são de outra pessoa (o conferente), não do separador.
    const ehSeparacao = (a) => /separa[cç][aã]o/i.test(a) && /inici|in[ií]cio|come[cç]|finaliz|conclu|termin|\bfim\b/i.test(a) && !/confer|etiqueta|impress/i.test(a);
    const sep = trs.slice(iCab + 1).filter((x) => ehSeparacao(x[iA] || '') && dataHora(x[iD]));
    if (!sep.length) continue;
    const inicios = sep.filter((x) => !/finaliz|conclu|termin|\bfim\b/i.test(x[iA]));
    const fins = sep.filter((x) => /finaliz|conclu|termin|\bfim\b/i.test(x[iA]));
    const r = juntar([...inicios.map((x) => ({ nome: limpo(x[iU]), ini: dataHora(x[iD]) })), ...fins.map((x) => ({ nome: inicios.length ? null : limpo(x[iU]), fim: dataHora(x[iD]) }))], 'histórico (separação)');
    if (r) return { ...r, atividades: [...atividades] };
  }
  return { separador: null, sep_inicio: null, sep_fim: null, como_sep: null, atividades: [...atividades] };
}
// Os andamentos do histórico da OS e quantas vezes aparecem (só os nomes dos eventos, para o diagnóstico).
function andamentosOs(html) {
  const cont = new Map();
  for (const t of String(html || '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => [...x[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => tirarTags(c[1])));
    const iCab = trs.findIndex((r) => r.some((c) => /^andamento$/i.test(c)));
    if (iCab < 0) continue;
    const iA = trs[iCab].findIndex((c) => /^andamento$/i.test(c));
    trs.slice(iCab + 1).forEach((x) => { const a = String(x[iA] || '').trim(); if (a) cont.set(a, (cont.get(a) || 0) + 1); });
  }
  return [...cont];
}
// A OS inteira: quem imprimiu as etiquetas (lerImpressao) e a separação (lerSeparacao). null sem nenhum dos dois.
function lerOs(html) {
  const imp = lerImpressao(html);
  const sep = lerSeparacao(html);
  if (!imp && !sep.separador && !sep.sep_inicio) return null;
  return { usuario: imp?.usuario || null, impresso_em: imp?.impresso_em || null, como: imp?.como || null, ...sep };
}

// Estrutura da OS sem os dados (para o diagnóstico): rótulos ("Algo:") e títulos das tabelas.
function descreverOs(html) {
  const h = String(html || '');
  const corpo = h.replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const rotulos = [...new Set(tirarTags(corpo.replace(/<\/(td|th|div|p|label|span|li|b|strong|h[1-6])>/gi, ' | ')).split('|')
    .flatMap((seg) => [...seg.matchAll(/([A-Za-zÀ-ÿ.\/][A-Za-zÀ-ÿ.\/ ]{1,39}):/g)].map((m) => m[1].trim())))].slice(0, 60);
  const tabelas = [...h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => {
    const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const th = trs.find((l) => /<th\b/i.test(l[1])) || trs[0];
    return { titulos: th ? [...th[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) => tirarTags(x[1])).filter(Boolean) : [], linhas: Math.max(0, trs.length - 1) };
  }).filter((t) => t.titulos.length);
  return { titulo: tirarTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]), rotulos, tabelas };
}
const urlOs = (c, exp) => new URL(`/expedicao/os/index/id/${encodeURIComponent(String(exp).replace(/\D/g, ''))}`, c.url).toString();

// Abre a OS e grava quem imprimiu e quando em todos os pedidos daquela expedição.
// ---------- Separador: tela Expedição > Separação > Definir Equipe de Separação (apontamento de separação) ----------
// /expedicao/index/apontamento-separacao: tabela "Planos de Separação" com Equipe (separador; o CPF que vem junto não é
// guardado), Mapa/Etiquetas, Expedição (várias), Separação, Data Início, Data Finalização e Status.
// A tela também tem Adicionar, Iniciar e Finalizar Separação: o Nexofrete só envia o formulário de BUSCA.
const CAMINHO_APONTAMENTO = '/expedicao/index/apontamento-separacao';
const PERIGOSO = /adicion|inici|finaliz|exclu|salvar|gravar|remov|apagar|confirm|cadastr|incluir/i;

function lerApontamentos(html) {
  const { dataHora } = require('./pedidosWms');
  const h = String(html || '');
  for (const t of h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => [...x[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1]));
    const norm = (c) => tirarTags(c).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const iCab = trs.findIndex((r) => r.some((c) => norm(c) === 'equipe') && r.some((c) => norm(c).startsWith('expedi')));
    if (iCab < 0) continue;
    const cab = trs[iCab].map(norm);
    const col = (f) => cab.findIndex(f);
    const iE = col((x) => x === 'equipe'); const iX = col((x) => x.startsWith('expedi')); const iI = col((x) => x.startsWith('data inicio'));
    const iF = col((x) => x.startsWith('data finaliza') || x === 'data final'); const iS = col((x) => x === 'status'); const iP = col((x) => x === 'separacao');
    const linhas = [];
    for (const r of trs.slice(iCab + 1)) {
      if (r.length < cab.length - 1) continue;
      const expedicoes = tirarTags(String(r[iX] || '').replace(/<br\s*\/?>/gi, ' ')).split(/[^\d]+/).filter(Boolean);
      if (!expedicoes.length) continue;
      // "(22082686795) DANILO FERREIRA": sem o CPF. Mais de um na equipe: um por linha.
      const separadores = String(r[iE] || '').split(/<br\s*\/?>|\n|;|,/i).map((x) => tirarTags(x).replace(/\(\s*[\d.\-\/ ]+\s*\)/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      linhas.push({ expedicoes, separadores, inicio: dataHora(tirarTags(r[iI] || '')), fim: dataHora(tirarTags(r[iF] || '')),
        status: iS >= 0 ? tirarTags(r[iS] || '') || null : null, separacao: iP >= 0 ? tirarTags(r[iP] || '') || null : null });
    }
    return linhas;
  }
  return null;
}
// O que vale para uma expedição: todos os planos dela juntos (nomes, o início mais cedo e o fim mais tarde).
function separacaoDaExpedicao(linhas, exp) {
  const dela = (linhas || []).filter((l) => l.expedicoes.includes(String(exp)));
  if (!dela.length) return null;
  const nomes = [...new Set(dela.flatMap((l) => l.separadores))];
  const ini = dela.map((l) => l.inicio).filter(Boolean).sort()[0] || null;
  const fins = dela.map((l) => l.fim).filter(Boolean).sort();
  // Fim só quando todos os planos da expedição terminaram.
  const fim = dela.every((l) => l.fim) ? fins.pop() || null : null;
  return { separador: nomes.join(', ') || null, sep_inicio: ini, sep_fim: fim, status: dela.map((l) => l.status).filter(Boolean).join(', ') || null };
}

// Acha o formulário de BUSCA da tela (botão Buscar e campo Expedição; nenhum botão que grave ou mude algo).
function formularioBusca(html) {
  const h = String(html || '');
  const forms = [...h.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  const desc = descreverTela(h).formularios;
  for (let i = 0; i < forms.length; i++) {
    const d = desc[i]; const corpo = forms[i][2];
    if (!d) continue;
    const botoes = d.campos.filter((x) => ['submit', 'button', 'image'].includes(x.tipo));
    const textoBotoes = `${botoes.map((b) => `${b.valor_botao || ''} ${b.nome || ''} ${b.id || ''}`).join(' ')} ${[...corpo.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => tirarTags(m[1])).join(' ')}`;
    if (!/buscar|pesquisar|filtrar/i.test(textoBotoes) || PERIGOSO.test(textoBotoes)) continue;
    const campos = [];
    // Campos na ordem da página; o <select> com as opções dele (sem engolir os campos seguintes).
    const achados = [...corpo.matchAll(/<(input|textarea)\b([^>]*)>/gi), ...corpo.matchAll(/<(select)\b([^>]*)>([\s\S]*?)<\/select>/gi)].sort((a, b) => a.index - b.index);
    for (const m of achados) {
      const nome = attr(m[2], 'name'); if (!nome) continue;
      const tipo = (attr(m[2], 'type') || m[1]).toLowerCase();
      const dd = d.campos.find((x) => x.nome === nome) || {};
      let valor = attr(m[2], 'value') ?? '';
      if (m[1].toLowerCase() === 'select') valor = attr(((m[3] || '').match(/<option\b[^>]*selected[^>]*>/i) || (m[3] || '').match(/<option\b[^>]*>/i) || [''])[0], 'value') ?? '';
      campos.push({ nome, tipo, valor, rotulo: dd.rotulo || '' });
    }
    const exp = campos.find((x) => /expedi/i.test(x.rotulo) || /exped/i.test(x.nome));
    if (!exp) continue;
    const texto = campos.filter((x) => !['hidden', 'submit', 'button', 'image', 'checkbox', 'radio'].includes(x.tipo) && x !== exp);
    const de = texto.find((x) => /in[ií]cio|entre|data\s*ini|^de$/i.test(x.rotulo) || /ini|de$/i.test(x.nome));
    const ate = texto.find((x) => x !== de && (/^at[eé]|final|fim/i.test(x.rotulo) || /fim|final|ate/i.test(x.nome)));
    const botao = botoes.find((b) => /buscar|pesquisar|filtrar/i.test(`${b.valor_botao || ''} ${b.nome || ''}`) && b.nome);
    return { action: attr(forms[i][1], 'action'), method: (attr(forms[i][1], 'method') || 'get').toUpperCase(), campos, exp, de, ate, botao };
  }
  return null;
}

// Busca na tela de apontamento: por expedição (sem datas; se a tela exigir, os últimos 120 dias) ou por período.
async function buscarApontamentos(sessao, c, { expedicao = null, de = null, ate = null } = {}) {
  const base = new URL(CAMINHO_APONTAMENTO, c.url).toString();
  const pg = await sessao.pedir(base, { timeout: 30000 });
  if (temSenha(pg.corpo)) return { sessao_caiu: true };
  const f = formularioBusca(pg.corpo);
  if (!f) throw Object.assign(falha('Não achei o formulário de busca na tela de apontamento de separação (ou ele tem botões que alteram dados). Nada foi enviado.', 502),
    { diagnostico: diagnosticoTela(pg.corpo, pg.url) });
  const enviar = async (dIni, dFim) => {
    const dados = {};
    for (const x of f.campos) {
      if (['submit', 'button', 'image'].includes(x.tipo)) continue;
      if (['checkbox', 'radio'].includes(x.tipo)) continue;
      dados[x.nome] = x.tipo === 'hidden' || x.tipo === 'select' ? x.valor : '';
    }
    dados[f.exp.nome] = expedicao ? String(expedicao) : '';
    if (f.de) dados[f.de.nome] = dIni ? dataBr(dIni) : '';
    if (f.ate) dados[f.ate.nome] = dFim ? dataBr(dFim) : '';
    if (f.botao) dados[f.botao.nome] = f.botao.valor_botao || 'Buscar';
    const destino = new URL(f.action || base, pg.url);
    if (f.method === 'GET') { destino.search = new URLSearchParams(dados).toString(); return sessao.pedir(destino.toString(), { timeout: 60000 }); }
    return sessao.pedir(destino.toString(), { metodo: 'POST', form: dados, timeout: 60000 });
  };
  const hoje = new Date(Date.now() - 3 * 3600000);
  let r = await enviar(expedicao ? null : de, expedicao ? null : ate);
  let linhas = lerApontamentos(r.corpo);
  if (expedicao && (!linhas || !linhas.length)) { r = await enviar(new Date(hoje.getTime() - 120 * 86400000), hoje); linhas = lerApontamentos(r.corpo); }
  if (temSenha(r.corpo)) return { sessao_caiu: true };
  return { linhas: linhas || [], tabela: linhas != null, form: f, url: r.url };
}
// Diagnóstico de uma tela sem os dados: formulários (campos e botões, sem valores), botões e links fora dos formulários
// (texto, onclick, href) e os trechos de script que fazem buscas (url, ajax, $.post...), para achar como a tela busca.
function diagnosticoTela(html, url) {
  const h = String(html || '');
  const t = descreverTela(h);
  const l = [`TELA: ${url}`, `Título: ${t.titulo || '-'}`, `Formulários: ${t.formularios.length}`];
  t.formularios.forEach((f, i) => {
    l.push(`Formulário ${i + 1}: ${f.method} ${f.action || '(mesma página)'}${f.id ? ` id=${f.id}` : ''}${f.nome ? ` name=${f.nome}` : ''}`);
    f.campos.forEach((c) => l.push(`   - ${c.tipo}${c.nome ? ` nome=${c.nome}` : ''}${c.id ? ` id=${c.id}` : ''}${c.rotulo ? ` rótulo="${c.rotulo.slice(-40)}"` : ''}${c.valor_botao ? ` botão="${c.valor_botao}"` : ''}`));
  });
  const semForm = h.replace(/<form\b[\s\S]*?<\/form>/gi, ' ');
  const botoes = [...semForm.matchAll(/<(button|a)\b([^>]*)>([\s\S]{0,300}?)<\/\1>/gi), ...semForm.matchAll(/<(input)\b([^>]*)>()/gi)].sort((x, y) => x.index - y.index)
    .map((m) => ({ tag: m[1].toLowerCase(), texto: tirarTags(m[3]) || attr(m[2], 'value') || '', onclick: attr(m[2], 'onclick'), href: attr(m[2], 'href'), id: attr(m[2], 'id'), nome: attr(m[2], 'name'), tipo: attr(m[2], 'type') }))
    .filter((b) => (b.tag !== 'a' || b.onclick || /btn|botao|button/i.test(b.id || '') || /buscar|pesquis|iniciar|finaliz|adicion|limpar|voltar/i.test(b.texto)) && (b.tag !== 'input' || /button|submit|image/i.test(b.tipo || '')))
    .slice(0, 30);
  if (botoes.length) { l.push('Botões e links fora de formulário:'); botoes.forEach((b) => l.push(`   - ${b.tag}${b.id ? ` id=${b.id}` : ''}${b.nome ? ` nome=${b.nome}` : ''} "${b.texto.slice(0, 40)}"${b.onclick ? ` onclick=${b.onclick.slice(0, 120)}` : ''}${b.href && !/^#?$/.test(b.href) ? ` href=${b.href.slice(0, 120)}` : ''}`)); }
  const campos = [...semForm.matchAll(/<(input|select)\b([^>]*)>/gi)].map((m) => ({ nome: attr(m[2], 'name'), id: attr(m[2], 'id'), tipo: attr(m[2], 'type') || m[1] }))
    .filter((c) => (c.nome || c.id) && !/hidden|button|submit/i.test(c.tipo)).slice(0, 30);
  if (campos.length) l.push(`Campos fora de formulário: ${campos.map((c) => `${c.nome || ''}${c.id ? `#${c.id}` : ''}`).join(' | ')}`);
  const trechos = [...h.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
    .flatMap((js) => [...js.matchAll(/[^;{}\n]{0,80}(?:url\s*[:=]|\$\.(?:post|get|ajax)|\.load\(|location\.href|window\.location|action\s*=)[^;{}\n]{0,160}/gi)].map((x) => x[0].replace(/\s+/g, ' ').trim()))
    .slice(0, 15);
  if (trechos.length) { l.push('Scripts que buscam ou mudam de página:'); trechos.forEach((x) => l.push(`   ${x}`)); }
  const scripts = [...h.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).filter((x) => !/jquery|bootstrap/i.test(x)).slice(0, 10);
  if (scripts.length) l.push(`Arquivos de script: ${scripts.join(' | ')}`);
  t.tabelas.forEach((x, i) => l.push(`Tabela ${i + 1}: ${x.linhas} linha(s); colunas: ${x.titulos.join(' | ')}`));
  return l.join('\n');
}

// Grava o separador da expedição em todos os pedidos dela (a tela de apontamento vale mais que a OS).
async function gravarSeparacao(exp, sep) {
  if (!sep) return 0;
  const { rowCount } = await pool.query(`UPDATE pedidos_wms SET separador = COALESCE($2, separador), separacao_inicio = COALESCE($3::timestamp, separacao_inicio),
      separacao_fim = COALESCE($4::timestamp, separacao_fim) WHERE expedicao_numero = $1`, [String(exp), sep.separador, sep.sep_inicio, sep.sep_fim]);
  return rowCount;
}

async function completarOs(sessao, c, expedicao) {
  if (!expedicao) return null;
  const r = await sessao.pedir(urlOs(c, expedicao), { timeout: 30000 });
  if (temSenha(r.corpo)) return { sessao_caiu: true };
  const os = lerOs(r.corpo);
  await pool.query(`UPDATE pedidos_wms SET usuario = COALESCE($2, usuario), etiquetas_impressas_em = COALESCE($3::timestamp, etiquetas_impressas_em),
      separador = COALESCE($4, separador), separacao_inicio = COALESCE($5::timestamp, separacao_inicio), separacao_fim = COALESCE($6::timestamp, separacao_fim),
      os_consultada_em = NOW(), os_leitura = 4
    WHERE expedicao_numero = $1`, [String(expedicao), os?.usuario || null, os?.impresso_em || null, os?.separador || null, os?.sep_inicio || null, os?.sep_fim || null]);
  // Separador pela tela de apontamento de separação (vale mais que o que a OS tiver).
  try {
    const ap = await buscarApontamentos(sessao, c, { expedicao });
    if (!ap.sessao_caiu) await gravarSeparacao(expedicao, separacaoDaExpedicao(ap.linhas, expedicao));
  } catch (e) { /* tela de apontamento fora: fica o da OS */ }
  return os;
}
// Expedições com a OS ainda incompleta (sem quem imprimiu ou sem o fim da separação): olhada de novo a cada 2 horas.
// Expedição FINALIZADA é lida mais uma vez depois do fim (expedicao_fim) e então para.
async function expedicoesSemOs(limite) {
  if (limite <= 0) return [];
  const { rows } = await pool.query(`SELECT expedicao_numero FROM pedidos_wms
     WHERE expedicao_numero IS NOT NULL AND COALESCE(status, '') !~* '^CANCELAD'
       AND (os_consultada_em IS NULL OR (os_consultada_em < NOW() - INTERVAL '2 hours' AND (usuario IS NULL OR separacao_fim IS NULL)
            AND (COALESCE(status, '') !~* '^FINALIZADO' OR os_consultada_em < expedicao_fim)))
     GROUP BY expedicao_numero ORDER BY MAX(atualizado_em) DESC LIMIT $1`, [limite]);
  return rows.map((x) => x.expedicao_numero);
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
function urlBusca(c, de, ate, carga = null) {
  const base = new URL(c.url_expedicao || '/expedicao?submit=Buscar&control=roll', c.url);
  const u = new URL(base.pathname, base);
  const p = new URLSearchParams(base.search);
  for (const k of ['idExpedicao', 'dataFinal1', 'dataFinal2', 'status', 'codCargaExterno', 'placa', 'pedido', 'produto']) p.set(k, '');
  p.set('submit', p.get('submit') || 'Buscar'); p.set('control', p.get('control') || 'roll');
  // Por carga (= pedido): sem período, como a busca feita à mão na tela.
  if (carga) { p.set('codCargaExterno', String(carga)); p.set('dataInicial1', ''); p.set('dataInicial2', ''); } else { p.set('dataInicial1', dataBr(de)); p.set('dataInicial2', dataBr(ate)); }
  u.search = p.toString();
  return u.toString();
}

// Pedidos do Nexofrete (últimos 60 dias) que a busca por período não trouxe: sem dados do WMS ou ainda não
// finalizados. A busca por período pode vir só com a 1ª página do WMS e não pega expedição que começou antes do
// período; por isso, depois dela, consulta carga por carga, no máximo "por_carga_max" por rodada. Quem foi consultado
// há pouco fica de fora (2 h se achou, 12 h se o WMS não tinha a carga), e os mais novos vêm primeiro.
async function cargasParaConsultar(jaVieram, limite) {
  if (limite <= 0) return [];
  const { rows } = await pool.query(`WITH ped AS (
      SELECT numero_pedido AS p, MAX(COALESCE(data_pedido, data_emissao_nf, criado_em::date)) AS d FROM fretes
       WHERE frete_principal_id IS NULL AND numero_pedido ~ '^[0-9]+$' AND data_entrega IS NULL
         AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Arquivado') AND COALESCE(data_pedido, data_emissao_nf, criado_em::date) >= CURRENT_DATE - 60
       GROUP BY numero_pedido
      UNION ALL
      SELECT numero_pedido, recebido_em::date FROM erp_pendentes WHERE numero_pedido ~ '^[0-9]+$' AND recebido_em >= NOW() - INTERVAL '60 days')
    SELECT ped.p FROM ped
      LEFT JOIN pedidos_wms w ON w.numero_pedido = ped.p
      LEFT JOIN wms_cargas_consultadas k ON k.numero_pedido = ped.p
     WHERE NOT (ped.p = ANY($1::text[]))
       AND COALESCE(w.status, '') !~* '^(FINALIZADO|CANCELAD)'
       AND (k.consultado_em IS NULL OR k.consultado_em < NOW() - CASE WHEN k.achado THEN INTERVAL '2 hours' ELSE INTERVAL '12 hours' END)
     GROUP BY ped.p, (w.numero_pedido IS NULL), k.consultado_em
     ORDER BY (w.numero_pedido IS NULL) DESC, k.consultado_em NULLS FIRST, MAX(ped.d) DESC
     LIMIT $2`, [[...jaVieram], limite]);
  return rows.map((r) => r.p);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Uma carga (= pedido) no WMS: busca, grava o que veio e anota que foi procurada.
async function buscarCarga(sessao, c, carga) {
  const r = await sessao.pedir(urlBusca(c, null, null, carga), { timeout: 30000 });
  if (temSenha(r.corpo)) return { sessao_caiu: true, achou: false, pedidos: 0 };
  const g = lerGrid(r.corpo);
  const ps = paraPedidos(g.linhas);
  // Uma expedição só com este pedido: as etiquetas válidas do Resumo são as dele.
  if (g.linhas.length === 1 && g.linhas[0].cargas.length === 1 && g.resumo?.etq_validas != null) ps.forEach((x) => { x.qtd_etiquetas = Math.round(g.resumo.etq_validas); });
  if (ps.length) await require('./pedidosWms').gravar(ps, 'wms');
  const achou = ps.some((x) => x.numero_pedido === String(carga));
  // Quem imprimiu as etiquetas e quando: na OS da expedição (se ainda não tem).
  const exp = ps.find((x) => x.numero_pedido === String(carga))?.expedicao_numero;
  if (exp) {
    const { rows: [w] } = await pool.query('SELECT usuario, separacao_fim FROM pedidos_wms WHERE numero_pedido = $1', [String(carga)]);
    if (!w?.usuario || !w?.separacao_fim) await completarOs(sessao, c, exp).catch(() => null);
  }
  await pool.query(`INSERT INTO wms_cargas_consultadas (numero_pedido, consultado_em, achado) VALUES ($1, NOW(), $2)
    ON CONFLICT (numero_pedido) DO UPDATE SET consultado_em = NOW(), achado = $2`, [String(carga), achou]);
  return { achou, pedidos: ps.length, linha: ps.find((x) => x.numero_pedido === String(carga)) || null };
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
    // Complemento carga por carga (os que a busca por período não trouxe).
    const porCarga = { consultadas: 0, achadas: 0, pedidos: 0 };
    const lista = await cargasParaConsultar(new Set(pedidos.map((x) => x.numero_pedido)), Math.min(Math.max(Number(c.por_carga_max ?? 40), 0), 200));
    for (const carga of lista) {
      await esperar(700);   // sem rajada: uma busca por vez, como uma pessoa
      const r = await buscarCarga(sessao, c, carga);
      if (r.sessao_caiu) break;
      porCarga.consultadas += 1; if (r.achou) porCarga.achadas += 1; porCarga.pedidos += r.pedidos;
    }
    // OS das expedições ainda sem quem imprimiu (mesmo limite da busca por carga).
    let oss = 0;
    for (const exp of await expedicoesSemOs(Math.min(Math.max(Number(c.por_carga_max ?? 40), 0), 200))) {
      await esperar(700);
      const o = await completarOs(sessao, c, exp).catch(() => null);
      if (o?.sessao_caiu) break;
      if (o?.usuario) oss += 1;
    }
    if (oss) porCarga.os = oss;
    // Separadores do período (uma busca só na tela de apontamento de separação).
    try {
      const ap = await buscarApontamentos(sessao, c, { de, ate: hoje });
      if (!ap.sessao_caiu) {
        const exps = [...new Set(ap.linhas.flatMap((l) => l.expedicoes))];
        let n = 0;
        for (const exp of exps) n += await gravarSeparacao(exp, separacaoDaExpedicao(ap.linhas, exp));
        if (n) porCarga.separacao = n;
      }
    } catch (e) { porCarga.erro_separacao = e.message; }
    const total = pedidos.length + porCarga.pedidos;
    const msg = `${g.linhas.length} expedição(ões) de ${dataBr(de)} a ${dataBr(hoje)}${incompleto ? ` (o WMS diz ${g.total}; vieram ${g.linhas.length})` : ''}`
      + `${porCarga.consultadas ? `; ${porCarga.consultadas} pedido(s) consultados pela carga, ${porCarga.achadas} achado(s) no WMS` : ''}${porCarga.os ? `; ${porCarga.os} OS com quem imprimiu` : ''}${porCarga.separacao ? `; separador em ${porCarga.separacao} pedido(s)` : ''}${porCarga.erro_separacao ? `; separação: ${porCarga.erro_separacao}` : ''}; ${total} pedido(s) atualizados`
      + ` (${origem}, ${Math.round((Date.now() - inicio) / 100) / 10} s)`;
    await registrar(true, msg, total);
    return { ok: true, expedicoes: g.linhas.length, pedidos: total, gravados, total_wms: g.total, incompleto, por_carga: porCarga, msg };
  } catch (e) {
    await registrar(false, e.message);
    throw e;
  } finally { consultando = false; }
}

// Um pedido só, na hora (o "🔎 buscar" da linha na tela Pedidos).
async function consultarCarga(carga) {
  const n = String(carga || '').replace(/\D/g, '');
  if (!n) throw falha('Informe o número do pedido.');
  const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
  if (!c) throw falha('Cadastre a ligação com o WMS.');
  const { sessao } = await entrar(c);
  const r = await buscarCarga(sessao, c, n);
  if (r.sessao_caiu) throw falha('O WMS voltou para o login na busca.', 502);
  return { ok: true, achou: r.achou, status: r.linha?.status || null,
    msg: r.achou ? `Pedido ${n} atualizado: ${r.linha?.status || 'sem status'}.` : `O WMS não tem a carga ${n} na tela Expedição Mercadorias.` };
}

// Busca completa em segundo plano: todos os pedidos dos últimos 60 dias sem dados do WMS ou não finalizados,
// um por vez (1 s entre as buscas). Para na hora se a integração for pausada. O andamento sai em situacao().
let busca = null;
async function buscarTodos(origem = 'manual') {
  if (consultando || busca?.rodando) throw falha('Já tem uma consulta ao WMS em andamento. Espere terminar.', 409);
  const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
  if (!c) throw falha('Cadastre a ligação com o WMS.');
  if (!c.ativo) throw falha('A integração com o WMS está pausada.', 409);
  const lista = await cargasParaConsultar(new Set(), 3000);
  busca = { rodando: true, total: lista.length, feitas: 0, achadas: 0, inicio: new Date().toISOString(), origem, parou: null };
  consultando = true;
  (async () => {
    try {
      let { sessao } = await entrar(c);
      for (const carga of lista) {
        if (busca.feitas % 10 === 0) {
          const { rows: [a] } = await pool.query('SELECT ativo FROM wms_config WHERE id = 1');
          if (!a?.ativo) { busca.parou = 'integração pausada'; break; }
        }
        await esperar(1000);
        let r = await buscarCarga(sessao, c, carga);
        if (r.sessao_caiu) { ({ sessao } = await entrar(c)); r = await buscarCarga(sessao, c, carga); if (r.sessao_caiu) { busca.parou = 'o WMS derrubou a sessão'; break; } }
        busca.feitas += 1; if (r.achou) busca.achadas += 1;
      }
    } catch (e) { busca.parou = e.message; } finally {
      busca.rodando = false; busca.fim = new Date().toISOString(); consultando = false;
      const msg = `Busca completa: ${busca.feitas} de ${busca.total} pedido(s) procurados, ${busca.achadas} achado(s) no WMS${busca.parou ? ` (parou: ${busca.parou})` : ''} (${origem})`;
      await pool.query('UPDATE wms_config SET ultima_consulta_em = NOW(), ultima_consulta_ok = $1, ultima_consulta_msg = $2, ultima_consulta_qtd = $3 WHERE id = 1',
        [!busca.parou || busca.parou === 'integração pausada', msg, busca.achadas]).catch(() => null);
    }
  })();
  return { ok: true, total: lista.length, msg: `Buscando ${lista.length} pedido(s) no WMS, um por vez (cerca de ${Math.max(1, Math.round(lista.length * 1.3 / 60))} min).` };
}

// Situação da ligação (para a tela Pedidos: "WMS atualizado às...").
async function situacao() {
  const { rows: [c] } = await pool.query(`SELECT ativo, intervalo_min, hora_inicio, hora_fim, ultima_consulta_ok, ultima_consulta_msg, ultima_consulta_qtd,
      to_char(ultima_consulta_em, 'YYYY-MM-DD HH24:MI') AS ultima_consulta_em, (url IS NOT NULL AND senha IS NOT NULL) AS configurado FROM wms_config WHERE id = 1`).catch(() => ({ rows: [] }));
  return { ...(c || { configurado: false, ativo: false }), busca: busca ? { ...busca } : null };
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

// Teste da OS de uma expedição: o que foi lido (usuário e data) e a estrutura da página, sem os outros dados.
async function testarOs(expedicao) {
  const n = String(expedicao || '').replace(/\D/g, '');
  if (!n) throw falha('Informe o número da expedição (ex.: 83383).');
  const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
  if (!c) throw falha('Cadastre a ligação com o WMS.');
  const { sessao } = await entrar(c);
  const r = await sessao.pedir(urlOs(c, n), { timeout: 30000 });
  if (temSenha(r.corpo)) throw falha('O WMS voltou para o login ao abrir a OS.', 502);
  const os = lerOs(r.corpo); const d = descreverOs(r.corpo);
  const texto = [`DIAGNOSTICO DA OS ${n} (${r.url}, HTTP ${r.status})`, '',
    os?.usuario ? `Impressão das etiquetas: "${os.usuario}" em ${os.impresso_em || '(sem data)'} (achado por: ${os.como})` : 'Impressão das etiquetas: NÃO achei quem imprimiu.',
    os?.separador || os?.sep_inicio ? `Separação: separador "${os.separador || '?'}", início ${os.sep_inicio || '-'}, fim ${os.sep_fim || '-'} (achado por: ${os.como_sep})` : 'Separação: NÃO achei.',
    `Atividades na tabela de atividades: ${(os?.atividades || lerSeparacao(r.corpo).atividades).join(' | ') || '-'}`,
    `Andamentos no histórico: ${andamentosOs(r.corpo).map(([a, n]) => `${a} (${n})`).join(' | ') || '-'}`,
    `Título: ${d.titulo || '-'}`, `Rótulos: ${d.rotulos.join(' | ') || '-'}`,
    ...d.tabelas.map((t, i) => `Tabela ${i + 1}: ${t.linhas} linha(s); colunas: ${t.titulos.join(' | ')}`)].join('\n');
  return { ok: !!os, os, texto };
}

// Teste da tela de apontamento de separação para uma expedição: o formulário de busca achado e o que foi lido.
async function testarSeparacao(expedicao) {
  const n = String(expedicao || '').replace(/\D/g, '');
  if (!n) throw falha('Informe o número da expedição (ex.: 83383).');
  const { rows: [c] } = await pool.query('SELECT * FROM wms_config WHERE id = 1');
  if (!c) throw falha('Cadastre a ligação com o WMS.');
  const { sessao } = await entrar(c);
  let ap;
  try { ap = await buscarApontamentos(sessao, c, { expedicao: n }); } catch (e) {
    // Tela diferente do esperado: devolve o diagnóstico dela (sem dados) para ajustar a leitura.
    if (e.diagnostico) return { ok: false, separacao: null, texto: `${e.message}\n\n${e.diagnostico}` };
    throw e;
  }
  if (ap.sessao_caiu) throw falha('O WMS voltou para o login na tela de apontamento.', 502);
  const sep = separacaoDaExpedicao(ap.linhas, n);
  const f = ap.form;
  const texto = [`DIAGNOSTICO DA SEPARACAO DA EXPEDICAO ${n} (${ap.url})`, '',
    sep ? `Separador: "${sep.separador || '?'}" · início ${sep.sep_inicio || '-'} · fim ${sep.sep_fim || '- (não finalizada)'} · status ${sep.status || '-'}` : 'NÃO achei plano de separação para esta expedição.',
    `Formulário de busca: ${f.method} ${f.action || '(mesma página)'} · expedição=${f.exp.nome} · início=${f.de?.nome || '-'} · até=${f.ate?.nome || '-'} · botão=${f.botao?.nome || '-'}`,
    `Campos enviados: ${f.campos.filter((x) => !['submit', 'button', 'image'].includes(x.tipo)).map((x) => `${x.nome} (${x.tipo}${x.rotulo ? `, "${x.rotulo}"` : ''})`).join(' | ')}`,
    `Tabela de planos: ${ap.tabela ? `${ap.linhas.length} plano(s) lido(s)` : 'não encontrada'}`].join('\n');
  return { ok: !!sep, separacao: sep, texto };
}

async function testar() {
  const c = await config();
  if (!c.url) throw falha('Cadastre o endereço do WMS primeiro.');
  const r = await diagnosticar(c.url);
  await pool.query('UPDATE wms_config SET ultimo_teste_em = NOW(), ultimo_teste_ok = $1 WHERE id = 1', [!!r.ok]);
  return r;
}

module.exports = { diagnosticoTela, lerApontamentos, separacaoDaExpedicao, formularioBusca, testarSeparacao, andamentosOs, lerResumo, lerOs, lerImpressao, lerSeparacao, descreverOs, testarOs, consultarCarga, buscarTodos, pausar, lerGrid, paraPedidos, urlBusca, consultar, situacao, talvezConsultar, agendar, avisoDoLogin, config, salvarConfig, diagnosticar, testar, testarTela, entrar, Sessao, descreverTela, textoTela, lerHtml, caminhosApi, montarTexto, urlValida };
