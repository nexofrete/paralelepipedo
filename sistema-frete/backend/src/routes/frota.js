// Frota: abastecimentos, manutenções, planos preventivos e painel de custo por km.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const frota = require('../frota');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'frota', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[frota]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/catalogo', autenticar, pode, rota(async (req, res) => {
  const { rows: veiculos } = await pool.query('SELECT id, placa, tipo, descricao, km_atual, km_atualizado_em, consumo_referencia, ativo FROM veiculos ORDER BY ativo DESC, tipo, placa');
  const { rows: motoristas } = await pool.query('SELECT id, nome FROM motoristas WHERE ativo ORDER BY nome');
  const { rows: acertos } = await pool.query(
    `SELECT id, motorista_nome, placa, descricao, data_saida FROM acertos WHERE status = 'aberto' AND tipo = 'proprio' ORDER BY data_saida DESC LIMIT 100`);
  res.json({ veiculos, motoristas, acertos, combustiveis: frota.COMBUSTIVEIS, pagamentos: frota.PAGAMENTOS, status: frota.STATUS_MANUT, modelos: frota.MODELOS_PLANO });
}, 'Erro.'));

// Km atual e consumo esperado do veículo (ajuste manual).
router.put('/veiculos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const km = req.body?.km_atual === '' || req.body?.km_atual == null ? null : Number(String(req.body.km_atual).split(',')[0].replace(/\D/g, ''));
  const ref = req.body?.consumo_referencia === '' || req.body?.consumo_referencia == null ? null : Number(String(req.body.consumo_referencia).replace(',', '.'));
  if (ref != null && !(ref > 0 && ref < 50)) throw Object.assign(new Error('Consumo de referência em km/l (ex.: 2,8 para um truck).'), { status: 400 });
  const { rows } = await pool.query(
    `UPDATE veiculos SET km_atual = COALESCE($2, km_atual), km_atualizado_em = CASE WHEN $2 IS NULL THEN km_atualizado_em ELSE CURRENT_DATE END, consumo_referencia = $3
      WHERE id = $1 RETURNING id, placa, km_atual, consumo_referencia`, [req.params.id, km, ref]);
  if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  log(req, `Ajustou o veículo ${rows[0].placa}: km ${rows[0].km_atual ?? '—'}, consumo de referência ${rows[0].consumo_referencia ?? '—'} km/l`);
  return res.json(rows[0]);
}, 'Erro.'));

router.get('/painel', autenticar, pode, rota(async (req, res) => res.json(await frota.painel(req.query)), 'Erro ao montar o painel.'));

// ---- Abastecimentos ----
router.get('/abastecimentos', autenticar, pode, rota(async (req, res) => res.json(await frota.listarAbastecimentos(req.query)), 'Erro ao listar.'));
router.post('/abastecimentos', autenticar, pode, rota(async (req, res) => {
  const a = await frota.criarAbastecimento(req.body || {}, req.usuario.nome);
  log(req, `Abastecimento ${a.placa}: ${a.litros} L de ${frota.COMBUSTIVEIS[a.combustivel]} por ${moeda(a.valor_total)}${a.km != null ? ` (km ${a.km})` : ''} — ${frota.PAGAMENTOS[a.pagamento]}`);
  res.status(201).json(a);
}, 'Erro ao lançar o abastecimento.'));
router.delete('/abastecimentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const a = await frota.excluirAbastecimento(Number(req.params.id));
  log(req, `Excluiu o abastecimento de ${a.placa} de ${String(a.data instanceof Date ? a.data.toISOString() : a.data).slice(0, 10)} (${moeda(a.valor_total)})`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));

// ---- Manutenções ----
router.get('/manutencoes', autenticar, pode, rota(async (req, res) => res.json(await frota.listarManutencoes(req.query)), 'Erro ao listar.'));
router.post('/manutencoes', autenticar, pode, rota(async (req, res) => {
  const m = await frota.criarManutencao(req.body || {}, req.usuario.nome);
  log(req, `Manutenção ${m.id} (${frota.STATUS_MANUT[m.status]}): ${m.descricao} — ${moeda(m.valor_total)}`);
  res.status(201).json(m);
}, 'Erro ao salvar a manutenção.'));
router.put('/manutencoes/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const m = await frota.alterarManutencao(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Manutenção ${m.id} ${m.status === 'concluida' ? 'concluída' : 'alterada'}: ${m.descricao} — ${moeda(m.valor_total)}`);
  res.json(m);
}, 'Erro ao salvar a manutenção.'));
router.post('/manutencoes/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  const m = await frota.cancelarManutencao(Number(req.params.id));
  log(req, `Cancelou a manutenção ${m.id}: ${m.descricao}`);
  res.json(m);
}, 'Erro.'));
router.delete('/manutencoes/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const m = await frota.excluirManutencao(Number(req.params.id));
  log(req, `Excluiu a manutenção ${m.id}: ${m.descricao} (${moeda(m.valor_total)})`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));

// ---- Planos preventivos ----
router.get('/planos', autenticar, pode, rota(async (req, res) => res.json(await frota.listarPlanos(req.query)), 'Erro.'));
router.post('/planos', autenticar, pode, rota(async (req, res) => {
  const p = await frota.criarPlano(req.body || {});
  if (p.length) log(req, `Plano preventivo "${p[0].item}" em ${p.length} veículo(s)`);
  res.status(201).json(p);
}, 'Erro ao salvar o plano.'));
router.put('/planos/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await frota.alterarPlano(Number(req.params.id), req.body || {})), 'Erro ao salvar o plano.'));
router.delete('/planos/:id(\\d+)', autenticar, pode, rota(async (req, res) => { await frota.excluirPlano(Number(req.params.id)); res.json({ ok: true }); }, 'Erro.'));

module.exports = router;
