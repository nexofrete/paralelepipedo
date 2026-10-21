// Parceiros e redespacho (regras em src/parceiros.js): cadastro, repasse das cargas,
// conta-corrente e acerto. Operação (quem emite CT-e) cadastra e repassa; o acerto pede o financeiro.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const parceiros = require('../parceiros');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const financeiro = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'parceiros', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[parceiros]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/', autenticar, pode, rota(async (req, res) => res.json({ parceiros: await parceiros.listar(), ufs: parceiros.UFS }), 'Erro ao listar.'));
router.post('/', autenticar, pode, rota(async (req, res) => { const p = await parceiros.salvar(null, req.body || {}); log(req, `Cadastrou o parceiro ${p.nome}`); res.status(201).json(p); }, 'Erro ao salvar.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => { const p = await parceiros.salvar(Number(req.params.id), req.body || {}); log(req, `Alterou o parceiro ${p.nome}`); res.json(p); }, 'Erro ao salvar.'));
// Quem atende os destinos dos CT-e marcados (a sugestão do repasse).
router.post('/sugestao', autenticar, pode, rota(async (req, res) => {
  const ids = (req.body?.ctes || []).map(Number).filter(Number.isInteger);
  const { rows } = await pool.query(`SELECT id, numero, cidade_fim, uf_fim, dados->'valores'->>'vTPrest' AS frete, dados FROM ctes_emitidos WHERE id = ANY($1::int[])`, [ids]);
  const destinos = [...new Map(rows.map((c) => [`${c.cidade_fim}/${c.uf_fim}`, c])).values()];
  const porDestino = [];
  for (const c of destinos) porDestino.push({ destino: `${c.cidade_fim}/${c.uf_fim}`, parceiros: await parceiros.sugerir(c.cidade_fim, c.uf_fim) });
  const todos = await parceiros.listar();
  // Custo previsto de cada parceiro ativo para estes CT-e.
  const previsto = Object.fromEntries(todos.filter((p) => p.ativo).map((p) => [p.id, rows.reduce((s, c) => s + parceiros.custoPrevisto(p, { frete: Number(c.frete) || 0, peso: (c.dados?.carga?.quantidades || []).filter((q) => String(q.cUnid).padStart(2, '0') === '01').reduce((t, q) => t + Number(q.qCarga || 0), 0) }), 0)]));
  res.json({ por_destino: porDestino, parceiros: todos.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome, prazo_dias: p.prazo_dias, custo_previsto: Math.round(previsto[p.id] * 100) / 100 })),
    frete: rows.reduce((s, c) => s + (Number(c.frete) || 0), 0) });
}, 'Erro.'));
router.post('/:id(\\d+)/repassar', autenticar, pode, rota(async (req, res) => {
  const r = await parceiros.repassar(Number(req.params.id), req.body?.ctes, req.usuario.nome);
  log(req, `Repassou ${r.ctes} CT-e ao parceiro ${r.parceiro} (romaneio de redespacho ${r.romaneio_id}, custo previsto ${moeda(r.custo_previsto)})`);
  res.status(201).json(r);
}, 'Erro ao repassar.'));
router.get('/:id(\\d+)/extrato', autenticar, pode, rota(async (req, res) => res.json(await parceiros.extrato(Number(req.params.id), req.query)), 'Erro.'));
router.post('/:id(\\d+)/lancamentos', autenticar, financeiro, rota(async (req, res) => {
  const l = await parceiros.lancar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Lançou ${parceiros.TIPOS[l.tipo].nome} de ${moeda(l.valor)} na conta do parceiro #${req.params.id}`);
  res.status(201).json(l);
}, 'Erro ao lançar.'));
router.put('/lancamentos/:id(\\d+)', autenticar, financeiro, rota(async (req, res) => {
  const l = await parceiros.alterarValor(Number(req.params.id), req.body?.valor, req.body?.motivo);
  log(req, `Ajustou o lançamento ${l.id} do parceiro #${l.parceiro_id} para ${moeda(l.valor)}`);
  res.json(l);
}, 'Erro.'));
router.delete('/lancamentos/:id(\\d+)', autenticar, financeiro, rota(async (req, res) => { await parceiros.excluirLancamento(Number(req.params.id)); log(req, `Apagou o lançamento ${req.params.id} da conta de parceiro`); res.json({ ok: true }); }, 'Erro.'));
router.post('/:id(\\d+)/acertar', autenticar, financeiro, rota(async (req, res) => {
  const r = await parceiros.acertar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Acerto com o parceiro ${r.parceiro}: ${r.lancamentos} lançamento(s), saldo ${moeda(r.saldo)}${r.conta_pagar_id ? ' (conta a pagar lançada)' : ''}`);
  res.json(r);
}, 'Erro no acerto.'));

module.exports = router;
