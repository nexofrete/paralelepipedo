// PIX com baixa automática pela API Pix do banco (padrão do Banco Central, igual em todos os bancos):
//  • Cobrança da fatura: PUT /v2/cobv/{txid} (com vencimento, multa e juros) ou PUT /v2/cob/{txid}
//    (imediata). O banco devolve o "copia e cola" dinâmico, que vai no QR Code da fatura.
//  • Baixa: o sistema consulta os PIX recebidos (GET /v2/pix) a cada 5 minutos e, se o banco avisar
//    pelo webhook, na hora (o aviso só dispara a consulta: o que vale é o que o banco confirma).
//    Cada PIX baixa a fatura uma vez só (endToEndId).
//  • Autenticação: OAuth2 (client_id e client_secret) com o certificado do banco (mTLS, arquivo .pfx).
// Sem a API ligada, a fatura continua com o PIX estático (chave da empresa), como sempre.
// O SIMULADOR faz o fluxo completo sem banco (com um botão para simular o pagamento).
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const pool = require('../db');
const { criptografar, descriptografar } = require('../rastreioLonngren');
const { brCode, normalizarChave } = require('./pix');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const hojeIso = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dataLocal = (iso) => new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
const PASTA = path.join(__dirname, '..', '..', 'dados');
const ARQ_CERT = path.join(PASTA, 'pix-certificado.pfx');
const ESCOPO_PADRAO = 'cob.write cob.read cobv.write cobv.read pix.read webhook.read webhook.write';

// ---------- Configuração ----------
const PADRAO = {
  ativo: false, provedor: 'simulador', tipo: 'cobv', url_api: '', url_token: '', client_id: '', client_secret: null, escopo: ESCOPO_PADRAO,
  parametro_extra: '', cert_senha: null, multa_pct: 2, juros_pct_mes: 1, validade_apos_vencimento: 30, expiracao_dias: 30, ultima_conferencia: null,
};
async function config({ segredos = false } = {}) {
  const { rows } = await pool.query('SELECT pix_api_config FROM empresa WHERE id = 1');
  const c = { ...PADRAO, ...(rows[0]?.pix_api_config || {}) };
  const tem = { client_secret: !!c.client_secret, cert_senha: !!c.cert_senha, certificado: fs.existsSync(ARQ_CERT) };
  if (segredos) return { ...c, client_secret: descriptografar(c.client_secret), cert_senha: descriptografar(c.cert_senha), tem };
  return { ...c, client_secret: tem.client_secret ? '••••••' : '', cert_senha: tem.cert_senha ? '••••••' : '', tem };
}
function urlOk(u, rotulo) {
  if (!u) return '';
  let x; try { x = new URL(u); } catch { throw falha(`${rotulo} inválida.`); }
  // http só para teste na própria máquina; banco de verdade é sempre https.
  if (x.protocol !== 'https:' && !(x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))) throw falha(`${rotulo}: use https://.`);
  return u.replace(/\/+$/, '');
}
async function salvarConfig(b = {}) {
  const atual = await config({ segredos: true });
  const segredo = (v, antigo) => (!v || /^•+$/.test(v) ? (antigo ? criptografar(antigo) : null) : criptografar(String(v).slice(0, 300)));
  // Campo em branco fica com o padrão (não vira zero).
  const n = (v, pad, min, max) => { if (v == null || String(v).trim() === '') return pad; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? Math.min(Math.max(x, min), max) : pad; };
  const c = {
    ativo: !!b.ativo, provedor: b.provedor === 'api' ? 'api' : 'simulador', tipo: b.tipo === 'cob' ? 'cob' : 'cobv',
    url_api: urlOk(texto(b.url_api, 300), 'URL da API Pix'), url_token: urlOk(texto(b.url_token, 300), 'URL do token'),
    client_id: texto(b.client_id, 300) || '', client_secret: segredo(b.client_secret, atual.client_secret), escopo: texto(b.escopo, 300) || ESCOPO_PADRAO,
    parametro_extra: /^[\w.-]+=[^&\s]+$/.test(String(b.parametro_extra || '').trim()) ? String(b.parametro_extra).trim() : '',
    cert_senha: segredo(b.cert_senha, atual.cert_senha),
    multa_pct: n(b.multa_pct, 2, 0, 2), juros_pct_mes: n(b.juros_pct_mes, 1, 0, 10), validade_apos_vencimento: Math.round(n(b.validade_apos_vencimento, 30, 0, 365)),
    expiracao_dias: Math.round(n(b.expiracao_dias, 30, 1, 365)), ultima_conferencia: atual.ultima_conferencia,
  };
  if (c.ativo && c.provedor === 'api' && (!c.url_api || !c.url_token || !c.client_id || !c.client_secret)) {
    throw falha('Para ligar a API Pix do banco, preencha a URL da API, a URL do token, o client_id e o client_secret (vêm do portal do desenvolvedor do banco).');
  }
  const { rows: [e] } = await pool.query('SELECT pix_chave FROM empresa WHERE id = 1');
  if (c.ativo && !e?.pix_chave) throw falha('Cadastre a chave PIX da empresa antes de ligar a cobrança pela API.');
  await pool.query('UPDATE empresa SET pix_api_config = $1 WHERE id = 1', [c]);
  return config();
}
async function salvarCertificado(base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (buf.length < 100 || buf.length > 200000) throw falha('Arquivo de certificado inválido (.pfx ou .p12 do banco).');
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(ARQ_CERT, buf, { mode: 0o600 });
  return { ok: true };
}

// ---------- Chamadas HTTP (mTLS + OAuth2) ----------
let tokenCache = null;
function requisicao(cfg, metodo, url, { corpo, cabecalhos = {}, form } = {}) {
  const u = new URL(url);
  if (cfg.parametro_extra && url.startsWith(cfg.url_api)) { const [k, v] = cfg.parametro_extra.split('='); u.searchParams.set(k, v); }
  const dados = form ? new URLSearchParams(form).toString() : corpo != null ? JSON.stringify(corpo) : null;
  const seguro = u.protocol === 'https:';
  const opcoes = {
    method: metodo, hostname: u.hostname, port: u.port || (seguro ? 443 : 80), path: `${u.pathname}${u.search}`, timeout: 20000,
    headers: { Accept: 'application/json', ...(dados ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {}), ...cabecalhos },
  };
  if (seguro && fs.existsSync(ARQ_CERT)) { opcoes.pfx = fs.readFileSync(ARQ_CERT); opcoes.passphrase = cfg.cert_senha || undefined; }
  return new Promise((ok, erro) => {
    const r = (seguro ? https : http).request(opcoes, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let j = null; try { j = b ? JSON.parse(b) : null; } catch { j = { texto: b.slice(0, 300) }; }
        if (res.statusCode >= 200 && res.statusCode < 300) ok(j);
        else erro(falha(`O banco respondeu ${res.statusCode}${j?.detail || j?.title || j?.error_description || j?.mensagem ? `: ${j.detail || j.title || j.error_description || j.mensagem}` : ''}.`, 502));
      });
    });
    r.on('timeout', () => r.destroy(new Error('o banco demorou demais para responder')));
    r.on('error', (e) => erro(falha(`Não consegui falar com o banco: ${e.message}`, 502)));
    if (dados) r.write(dados);
    r.end();
  });
}
async function token(cfg) {
  if (tokenCache && tokenCache.chave === cfg.client_id && tokenCache.expira > Date.now() + 30000) return tokenCache.valor;
  const basic = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
  const r = await requisicao(cfg, 'POST', cfg.url_token, { form: { grant_type: 'client_credentials', scope: cfg.escopo }, cabecalhos: { Authorization: `Basic ${basic}` } });
  if (!r?.access_token) throw falha('O banco não devolveu o token de acesso (confira client_id, client_secret e o certificado).', 502);
  tokenCache = { chave: cfg.client_id, valor: r.access_token, expira: Date.now() + (Number(r.expires_in) || 300) * 1000 };
  return r.access_token;
}
const chamar = async (cfg, metodo, caminho, corpo) => requisicao(cfg, metodo, `${cfg.url_api}${caminho}`, { corpo, cabecalhos: { Authorization: `Bearer ${await token(cfg)}` } });

// ---------- Provedores: API do banco (padrão Bacen) e simulador ----------
const API = {
  criar: (cfg, tipo, txid, corpo) => chamar(cfg, 'PUT', `/v2/${tipo}/${txid}`, corpo),
  consultar: (cfg, tipo, txid) => chamar(cfg, 'GET', `/v2/${tipo}/${txid}`),
  remover: (cfg, tipo, txid) => chamar(cfg, 'PATCH', `/v2/${tipo}/${txid}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }),
  async recebidos(cfg, inicio, fim) {
    const lista = [];
    for (let pagina = 0; pagina < 50; pagina += 1) {
      const r = await chamar(cfg, 'GET', `/v2/pix?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&paginacao.paginaAtual=${pagina}`);
      lista.push(...(r?.pix || []));
      const total = Number(r?.parametros?.paginacao?.quantidadeDePaginas) || 1;
      if (pagina + 1 >= total) break;
    }
    return lista;
  },
  testar: async (cfg) => { await token(cfg); return { ok: true }; },
};
const SIMULADOR = {
  async criar(cfg, tipo, txid, corpo, e) {
    return { txid, status: 'ATIVA', pixCopiaECola: brCode({ chave: corpo.chave, nome: e.razao_social, cidade: e.pix_cidade || e.municipio, valor: Number(corpo.valor.original), txid: txid.slice(0, 25) }) };
  },
  async consultar(cfg, tipo, txid) {
    const { rows } = await pool.query('SELECT * FROM pix_sim_pagamentos WHERE txid = $1', [txid]);
    return { txid, status: rows.length ? 'CONCLUIDA' : 'ATIVA', pix: rows.map((p) => ({ endToEndId: p.e2e, txid, valor: String(p.valor), horario: new Date(p.horario).toISOString() })) };
  },
  async remover() { return { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }; },
  async recebidos(cfg, inicio, fim) {
    const { rows } = await pool.query('SELECT * FROM pix_sim_pagamentos WHERE horario BETWEEN $1 AND $2', [inicio, fim]);
    return rows.map((p) => ({ endToEndId: p.e2e, txid: p.txid, valor: String(p.valor), horario: new Date(p.horario).toISOString() }));
  },
  async testar() { return { ok: true, simulado: true }; },
};
const provedor = (cfg) => (cfg.provedor === 'api' ? API : SIMULADOR);

// ---------- Cobrança da fatura ----------
// txid: 26 a 35 letras e números (regra do Bacen), com o id da fatura para achar de volta.
const novoTxid = (faturaId) => `NXF${String(faturaId).padStart(8, '0')}${crypto.randomBytes(12).toString('hex').slice(0, 18)}`;
function corpoCobranca(cfg, f, e) {
  const doc = String(f.tomador_doc || '');
  const devedor = /^\d{14}$/.test(doc) ? { cnpj: doc, nome: String(f.tomador_nome || '').slice(0, 200) } : /^\d{11}$/.test(doc) ? { cpf: doc, nome: String(f.tomador_nome || '').slice(0, 200) } : null;
  const valor = centavos(f.saldo).toFixed(2);
  const solicitacao = `Fatura ${f.numero}`.slice(0, 140);
  // Com vencimento (cobv) precisa do devedor; sem CPF/CNPJ válido, vai como cobrança imediata.
  if (cfg.tipo === 'cobv' && devedor) {
    const venc = String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10);
    return { tipo: 'cobv', vencimento: venc < hojeIso() ? hojeIso() : venc, corpo: {
      calendario: { dataDeVencimento: venc < hojeIso() ? hojeIso() : venc, validadeAposVencimento: cfg.validade_apos_vencimento }, devedor,
      valor: { original: valor, ...(cfg.multa_pct > 0 ? { multa: { modalidade: '2', valorPerc: Number(cfg.multa_pct).toFixed(2) } } : {}),
        ...(cfg.juros_pct_mes > 0 ? { juros: { modalidade: '3', valorPerc: Number(cfg.juros_pct_mes).toFixed(2) } } : {}) },
      chave: normalizarChave(e.pix_chave), solicitacaoPagador: solicitacao } };
  }
  return { tipo: 'cob', vencimento: null, corpo: { calendario: { expiracao: cfg.expiracao_dias * 86400 }, ...(devedor ? { devedor } : {}), valor: { original: valor }, chave: normalizarChave(e.pix_chave), solicitacaoPagador: solicitacao } };
}

// Copia e cola dinâmico da fatura (cria ou reaproveita a cobrança do saldo atual). null: API desligada.
async function cobrancaDaFatura(f, e) {
  const cfg = await config({ segredos: true });
  if (!cfg.ativo || !e.pix_chave || f.status === 'cancelada' || !(Number(f.saldo) > 0)) return null;
  const venc = String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento || '').slice(0, 10);
  const { rows: [atual] } = await pool.query(`SELECT * FROM pix_cobrancas WHERE fatura_id = $1 AND status = 'ativa' ORDER BY id DESC LIMIT 1`, [f.id]);
  const vencEsperado = cfg.tipo === 'cobv' ? (venc < hojeIso() ? hojeIso() : venc) : null;
  const atualVenc = atual?.vencimento ? String(atual.vencimento instanceof Date ? atual.vencimento.toISOString() : atual.vencimento).slice(0, 10) : null;
  if (atual && centavos(atual.valor) === centavos(f.saldo) && atual.provedor === cfg.provedor && (atual.tipo === 'cob' || atualVenc === vencEsperado)) {
    return { txid: atual.txid, copiaECola: atual.copia_e_cola, tipo: atual.tipo };
  }
  // Saldo ou vencimento mudou: tira a cobrança antiga do banco e faz outra.
  if (atual) await removerCobranca(atual, cfg).catch(() => {});
  const { tipo, vencimento, corpo } = corpoCobranca(cfg, f, e);
  const txid = novoTxid(f.id);
  const r = await provedor(cfg).criar(cfg, tipo, txid, corpo, e);
  const copia = r?.pixCopiaECola;
  if (!copia) throw falha('O banco não devolveu o PIX copia e cola da cobrança.', 502);
  await pool.query(
    `INSERT INTO pix_cobrancas (fatura_id, txid, tipo, provedor, valor, vencimento, status, copia_e_cola, location) VALUES ($1,$2,$3,$4,$5,$6,'ativa',$7,$8)`,
    [f.id, txid, tipo, cfg.provedor, centavos(f.saldo), vencimento, copia, r?.loc?.location || r?.location || null]);
  return { txid, copiaECola: copia, tipo };
}
async function removerCobranca(c, cfg) {
  try { await provedor(cfg).remover(cfg, c.tipo, c.txid); } finally {
    await pool.query(`UPDATE pix_cobrancas SET status = 'removida' WHERE id = $1 AND status = 'ativa'`, [c.id]);
  }
}

// ---------- Baixa automática ----------
async function baixarPix(p, cob) {
  const fat = require('./faturamento');
  // Este PIX já deu baixa (conferência repetida ou aviso do banco em dobro): nada a fazer.
  const { rows: [ja] } = await pool.query('SELECT 1 FROM faturas_transporte_pagamentos WHERE origem_chave = $1', [`pix:${p.endToEndId}`]);
  if (ja) {
    await pool.query(`UPDATE pix_cobrancas SET status = 'concluida', e2e = COALESCE(e2e, $2), concluida_em = COALESCE(concluida_em, NOW()), erro = NULL WHERE id = $1`, [cob.id, p.endToEndId]);
    return 'repetido';
  }
  try {
    await fat.receber(cob.fatura_id, { data: dataLocal(p.horario), valor: Number(p.valor), forma: 'pix', origem_chave: `pix:${p.endToEndId}`,
      observacao: `PIX ${p.endToEndId} (baixa automática)`, usuarioNome: 'PIX automático' });
    await pool.query(`UPDATE pix_cobrancas SET status = 'concluida', concluida_em = NOW(), e2e = $2, valor_pago = $3, erro = NULL WHERE id = $1`, [cob.id, p.endToEndId, Number(p.valor)]);
    return 'baixado';
  } catch (err) {
    if (err.status === 409 && /já foi baixado/.test(err.message)) { await pool.query(`UPDATE pix_cobrancas SET status = 'concluida' WHERE id = $1`, [cob.id]); return 'repetido'; }
    // Fatura já paga/cancelada por outro caminho: o PIX entrou e precisa de atenção (devolução ou crédito).
    await pool.query('UPDATE pix_cobrancas SET erro = $2, e2e = COALESCE(e2e, $3), valor_pago = COALESCE(valor_pago, $4) WHERE id = $1', [cob.id, `PIX recebido, mas não deu baixa: ${err.message}`.slice(0, 300), p.endToEndId, Number(p.valor)]);
    return 'erro';
  }
}

async function conferirRecebidos({ horas = 72 } = {}) {
  const cfg = await config({ segredos: true });
  if (!cfg.ativo) throw falha('A cobrança PIX pela API está desligada.', 409);
  const fim = new Date(); const inicio = new Date(fim.getTime() - horas * 3600000);
  const recebidos = await provedor(cfg).recebidos(cfg, inicio.toISOString(), fim.toISOString());
  const r = { recebidos: recebidos.length, baixados: 0, repetidos: 0, erros: 0, sem_fatura: 0 };
  for (const p of recebidos) {
    if (!p.txid || !p.endToEndId) { r.sem_fatura += 1; continue; }
    const { rows: [cob] } = await pool.query('SELECT * FROM pix_cobrancas WHERE txid = $1', [p.txid]);
    if (!cob) { r.sem_fatura += 1; continue; }
    const s = await baixarPix(p, cob);
    r[{ baixado: 'baixados', repetido: 'repetidos', erro: 'erros' }[s]] += 1;
  }
  // Cobranças de faturas já pagas ou canceladas por outro caminho saem do banco.
  const { rows: velhas } = await pool.query(
    `SELECT c.* FROM pix_cobrancas c JOIN faturas_transporte f ON f.id = c.fatura_id WHERE c.status = 'ativa' AND f.status IN ('paga', 'cancelada')`);
  for (const c of velhas) await removerCobranca(c, cfg).catch(() => {});
  await pool.query(`UPDATE empresa SET pix_api_config = jsonb_set(pix_api_config, '{ultima_conferencia}', $1::jsonb) WHERE id = 1`,
    [JSON.stringify({ em: new Date().toISOString(), ...r })]);
  return r;
}

// Aviso do banco (webhook): só serve de gatilho — cada txid é conferido na API antes de baixar.
async function aviso(corpo = {}) {
  const cfg = await config({ segredos: true });
  if (!cfg.ativo) return { ignorado: true };
  const txids = [...new Set((Array.isArray(corpo.pix) ? corpo.pix : []).map((p) => String(p?.txid || '')).filter((t) => /^[A-Za-z0-9]{26,35}$/.test(t)))].slice(0, 100);
  let baixados = 0;
  for (const txid of txids) {
    const { rows: [cob] } = await pool.query('SELECT * FROM pix_cobrancas WHERE txid = $1', [txid]);
    if (!cob) continue;
    const c = await provedor(cfg).consultar(cfg, cob.tipo, txid);
    for (const p of c?.pix || []) if ((await baixarPix({ ...p, txid }, cob)) === 'baixado') baixados += 1;
  }
  return { conferidos: txids.length, baixados };
}

// Pagamento de mentira (só no simulador): aparece como PIX recebido.
async function simularPagamento(faturaId, valor) {
  const cfg = await config();
  if (cfg.provedor !== 'simulador') throw falha('Só dá para simular pagamento com o simulador.', 409);
  const { rows: [cob] } = await pool.query(`SELECT * FROM pix_cobrancas WHERE fatura_id = $1 AND status = 'ativa' ORDER BY id DESC LIMIT 1`, [faturaId]);
  if (!cob) throw falha('Esta fatura não tem cobrança PIX ativa (abra ou imprima a fatura para gerar).', 404);
  const e2e = `E00000000${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}${crypto.randomBytes(6).toString('hex').slice(0, 11)}`.slice(0, 32);
  await pool.query('INSERT INTO pix_sim_pagamentos (txid, valor, e2e, horario) VALUES ($1, $2, $3, NOW())', [cob.txid, centavos(valor || cob.valor), e2e]);
  return { txid: cob.txid, e2e };
}

async function testar() { const cfg = await config({ segredos: true }); tokenCache = null; return provedor(cfg).testar(cfg); }

async function situacaoDaFatura(faturaId) {
  const { rows } = await pool.query('SELECT txid, tipo, provedor, valor, vencimento, status, criada_em, concluida_em, e2e, valor_pago, erro FROM pix_cobrancas WHERE fatura_id = $1 ORDER BY id DESC LIMIT 5', [faturaId]);
  return rows;
}

let agendado = null;
function agendar() {
  if (agendado) return;
  const rodar = async () => {
    try {
      const cfg = await config();
      if (!cfg.ativo) return;
      const { rows: [n] } = await pool.query(`SELECT COUNT(*)::int AS n FROM pix_cobrancas WHERE status = 'ativa'`);
      if (n.n) await conferirRecebidos();
    } catch (err) { console.error('[pix api]', err.message); }
  };
  agendado = setInterval(rodar, 5 * 60 * 1000);
  setTimeout(rodar, 60 * 1000);
}

module.exports = { config, salvarConfig, salvarCertificado, cobrancaDaFatura, conferirRecebidos, aviso, simularPagamento, testar, situacaoDaFatura, agendar, corpoCobranca, novoTxid };
