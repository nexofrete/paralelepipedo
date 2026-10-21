// Cobrança de serviços extras (regras em src/servicosExtras.js): preços, cobranças pendentes,
// aprovação e geração do CT-e complementar / NFS-e.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const extras = require('../servicosExtras');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'servicos_extras', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[servicos extras]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/', autenticar, pode, rota(async (req, res) => res.json(await extras.listar(req.query)), 'Erro ao listar.'));
router.get('/regras', autenticar, pode, rota(async (req, res) => res.json(await extras.regras()), 'Erro.'));
router.post('/regras', autenticar, pode, rota(async (req, res) => {
  const r = await extras.salvarRegra(req.body || {});
  log(req, `Preço de ${extras.SERVICOS[r.servico].nome}${r.cliente_doc ? ` para ${r.cliente_nome || r.cliente_doc}` : ' (padrão)'}: ${extras.MODOS[r.modo]} ${r.valor}${r.franquia ? `, franquia ${r.franquia}` : ''}${r.minimo ? `, mínimo ${moeda(r.minimo)}` : ''}`);
  res.json(r);
}, 'Erro ao salvar o preço.'));
router.delete('/regras/:id(\\d+)', autenticar, pode, rota(async (req, res) => { await extras.excluirRegra(Number(req.params.id)); log(req, `Apagou o preço por cliente #${req.params.id}`); res.json({ ok: true }); }, 'Erro.'));

// Lançamento manual: { cte (número ou id), servico, quantidade, valor, descricao }.
router.post('/', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const pool = require('../db');
  const { rows } = await pool.query(`SELECT id FROM ctes_emitidos WHERE status = 'autorizado' AND COALESCE(dados->>'tpCTe', '0') <> '1' AND (id = $1 OR numero::text = $2) ORDER BY (numero::text = $2) DESC, id DESC LIMIT 1`,
    [Number(b.cte_id) || 0, String(b.cte || '').replace(/\D/g, '') || '-']);
  if (!rows[0]) return res.status(400).json({ erro: 'CT-e autorizado não encontrado com esse número.' });
  const x = await extras.criar({ cteId: rows[0].id, servico: b.servico, quantidade: b.quantidade === '' ? null : b.quantidade, valor: b.valor === '' ? null : b.valor, descricao: b.descricao, origem: 'manual', usuario: req.usuario.nome });
  log(req, `Lançou ${extras.SERVICOS[x.servico].nome} no CT-e #${x.cte_id}: ${moeda(x.valor)}`);
  res.status(201).json(x);
}, 'Erro ao lançar.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await extras.alterar(Number(req.params.id), req.body || {})), 'Erro ao salvar.'));
router.post('/aprovar', autenticar, pode, rota(async (req, res) => {
  const r = await extras.aprovar(req.body?.ids, req.usuario.nome);
  log(req, `Aprovou ${r.aprovadas} cobrança(s) de serviço extra`);
  res.json(r);
}, 'Erro ao aprovar.'));
router.post('/cancelar', autenticar, pode, rota(async (req, res) => {
  const r = await extras.cancelar(req.body?.ids, req.body?.motivo);
  log(req, `Cancelou ${r.canceladas} cobrança(s) de serviço extra: ${String(req.body?.motivo || '').slice(0, 200)}`);
  res.json(r);
}, 'Erro ao cancelar.'));
router.post('/cobrar', autenticar, pode, rota(async (req, res) => {
  const r = await extras.cobrar(req.body?.ids, req.usuario.nome);
  log(req, `Gerou ${r.feitos.length} documento(s) de cobrança de serviço extra (${r.feitos.map((f) => `${f.tipo === 'cte' ? 'CT-e compl.' : 'NFS-e'} do CT-e ${f.cte}: ${moeda(f.valor)}`).join('; ')})`);
  res.json(r);
}, 'Erro ao gerar a cobrança.'));
router.post('/:id(\\d+)/reabrir', autenticar, pode, rota(async (req, res) => { await extras.reabrir(Number(req.params.id)); res.json({ ok: true }); }, 'Erro.'));

module.exports = router;
