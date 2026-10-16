// API v1 para ERP — autenticada por chave de API (Configuração → Integração).
//   GET  /api/v1/status
//   GET  /api/v1/ctes?alterado_desde=ISO&status=autorizado&limite=100&depois_de=<id>
//   GET  /api/v1/ctes/:chave            (44 dígitos) ou /api/v1/ctes/id/:id
//   GET  /api/v1/ctes/:chave/xml
//   GET  /api/v1/entregas?desde=AAAA-MM-DD&ate=AAAA-MM-DD
//   GET  /api/v1/faturas?alterado_desde=ISO&status=paga&limite=100&depois_de=<id>
//   GET  /api/v1/faturas/:id
//   POST /api/v1/nfe   { "xml": "<nfeProc>…" } ou { "xmls": [...] }   (escopo "lancar")
// Listas: ordenadas por "atualizado_em" (em milissegundos, como sai no JSON) e id; para buscar a próxima página, repita
// com alterado_desde = atualizado_em do último item e depois_de = id dele.
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { autenticarApi } = require('../integracao/chaves');
const recursos = require('../integracao/recursos');
const { registrar } = require('../auditoria');

const router = express.Router();
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const momentoOk = (v) => { if (!v) return null; const d = new Date(String(v)); if (Number.isNaN(d.getTime())) throw falha('alterado_desde inválido (use ISO 8601, ex.: 2026-10-01T00:00:00-03:00).'); return d.toISOString(); };
const limiteDe = (v) => Math.min(Math.max(parseInt(v, 10) || 100, 1), 500);
const rota = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (!err.status) console.error('[api v1]', err);
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro interno.' });
  }
};

// 120 chamadas por minuto por chave.
router.use(rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.headers.authorization || req.headers['x-api-key'] || req.ip).slice(0, 80),
  message: { erro: 'Muitas chamadas em pouco tempo. Espere um minuto.' },
}));

router.get('/status', autenticarApi('ler'), rota(async (req, res) => {
  const { rows: [e] } = await pool.query('SELECT razao_social, cnpj, cte_ambiente, cte_demonstracao FROM empresa WHERE id = 1');
  res.json({ ok: true, versao: 'v1', empresa: { nome: e?.razao_social || null, cnpj: e?.cnpj || null }, ambiente: Number(e?.cte_ambiente) === 1 ? 'producao' : 'homologacao',
    demonstracao: !!e?.cte_demonstracao, chave: { nome: req.apiChave.nome, escopos: req.apiChave.escopos } });
}));

// ---------- CT-e ----------
router.get('/ctes', autenticarApi('ler'), rota(async (req, res) => {
  const desde = momentoOk(req.query.alterado_desde);
  const depois = Number(req.query.depois_de) || 0;
  const status = ['autorizado', 'cancelado', 'substituido'].includes(req.query.status) ? req.query.status : null;
  const lim = limiteDe(req.query.limite);
  const { rows } = await pool.query(
    `SELECT ${recursos.COLUNAS_CTE} FROM ctes_emitidos c
      WHERE c.chave IS NOT NULL AND c.status IN ('autorizado', 'cancelado', 'substituido') AND ($3::text IS NULL OR c.status = $3)
        AND ($1::timestamptz IS NULL OR (date_trunc('milliseconds', c.atualizado_em), c.id) > ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo', $2::int))
      ORDER BY date_trunc('milliseconds', c.atualizado_em), c.id LIMIT $4`, [desde, depois, status, lim]);
  const itens = rows.map(recursos.cte);
  const ult = itens[itens.length - 1];
  res.json({ itens, quantidade: itens.length, proxima: itens.length === lim && ult ? { alterado_desde: ult.atualizado_em, depois_de: ult.id } : null });
}));

async function buscarCte(req) {
  const chave = String(req.params.chave || '').replace(/\D/g, '');
  if (chave.length !== 44) throw falha('Chave de CT-e inválida (44 dígitos).');
  const { rows: [c] } = await pool.query(`SELECT ${recursos.COLUNAS_CTE}, c.xml_autorizado FROM ctes_emitidos c WHERE c.chave = $1 ORDER BY c.id DESC LIMIT 1`, [chave]);
  if (!c) throw falha('CT-e não encontrado.', 404);
  return c;
}
router.get('/ctes/id/:id(\\d+)', autenticarApi('ler'), rota(async (req, res) => {
  const c = await recursos.ctePorId(Number(req.params.id));
  if (!c || !c.chave) throw falha('CT-e não encontrado.', 404);
  res.json(c);
}));
router.get('/ctes/:chave', autenticarApi('ler'), rota(async (req, res) => res.json(recursos.cte(await buscarCte(req)))));
router.get('/ctes/:chave/xml', autenticarApi('ler'), rota(async (req, res) => {
  const c = await buscarCte(req);
  if (!c.xml_autorizado) throw falha('Esse CT-e não tem XML autorizado.', 404);
  res.type('application/xml; charset=utf-8').send(c.xml_autorizado);
}));

// ---------- Entregas (CT-e com entrega no período) ----------
router.get('/entregas', autenticarApi('ler'), rota(async (req, res) => {
  const desde = iso(req.query.desde); const ate = iso(req.query.ate) || new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  if (!desde) throw falha('Informe desde=AAAA-MM-DD.');
  if (desde > ate || (Date.parse(ate) - Date.parse(desde)) / 86400000 > 92) throw falha('Período de até 92 dias.');
  const { rows } = await pool.query(
    `SELECT ${recursos.COLUNAS_CTE} FROM ctes_emitidos c WHERE c.status = 'autorizado' AND c.data_entrega IS NOT NULL
        AND (c.data_entrega AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date ORDER BY c.data_entrega, c.id LIMIT 5000`, [desde, ate]);
  res.json({ periodo: { desde, ate }, itens: rows.map(recursos.cte), quantidade: rows.length });
}));

// ---------- Faturas ----------
router.get('/faturas', autenticarApi('ler'), rota(async (req, res) => {
  const desde = momentoOk(req.query.alterado_desde);
  const depois = Number(req.query.depois_de) || 0;
  const status = ['aberta', 'parcial', 'paga', 'cancelada'].includes(req.query.status) ? req.query.status : null;
  const lim = limiteDe(req.query.limite);
  const { rows } = await pool.query(
    `SELECT ${recursos.COLUNAS_FATURA} FROM faturas_transporte f
      WHERE ($3::text IS NULL OR f.status = $3) AND ($1::timestamptz IS NULL OR (date_trunc('milliseconds', f.atualizado_em), f.id) > ($1::timestamptz, $2::int))
      ORDER BY date_trunc('milliseconds', f.atualizado_em), f.id LIMIT $4`, [desde, depois, status, lim]);
  const itens = await recursos.faturasCompletas(rows);
  const ult = itens[itens.length - 1];
  res.json({ itens, quantidade: itens.length, proxima: itens.length === lim && ult ? { alterado_desde: ult.atualizado_em, depois_de: ult.id } : null });
}));
router.get('/faturas/:id(\\d+)', autenticarApi('ler'), rota(async (req, res) => {
  const f = await recursos.faturaPorId(Number(req.params.id));
  if (!f) throw falha('Fatura não encontrada.', 404);
  res.json(f);
}));

// ---------- NF-e → rascunho de CT-e ----------
router.post('/nfe', autenticarApi('lancar'), rota(async (req, res) => {
  const b = req.body || {};
  const lista = (Array.isArray(b.xmls) ? b.xmls : [b.xml]).filter((x) => typeof x === 'string' && x.trim()).slice(0, 100);
  if (!lista.length) throw falha('Envie o XML da NF-e em "xml" (texto) ou uma lista em "xmls".');
  const xmls = lista.map((x, i) => ({ nome: `api-${i + 1}.xml`, buffer: Buffer.from(x, 'utf8') }));
  const r = await require('../cte/rascunhoDaNfe').rascunhosDosXml(xmls, { tipo: 'api', usuario: `API: ${req.apiChave.nome}` });
  registrar({ usuarioNome: `API: ${req.apiChave.nome}`, acao: 'api_nfe', detalhes: `Recebeu ${xmls.length} NF-e pela API: ${r.criados.length} rascunho(s) de CT-e` });
  res.status(r.criados.length ? 201 : 200).json({
    rascunhos: r.criados.map((c) => ({ cte_id: c.id, nfs: c.nfs, destinatario: c.destinatario, valor: c.valor, avisos: c.avisos || [] })),
    ignoradas: r.ignoradas,
  });
}));

router.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada na API v1.' }));

module.exports = router;
