// Armazenagem (regras em src/armazem.js): contratos, entradas (NF-e), saídas, inventário,
// estoque, pedidos de saída do portal e a cobrança mensal em NFS-e.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const arm = require('../armazem');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const financeiro = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'armazem', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[armazem]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};

router.get('/', autenticar, pode, rota(async (req, res) => res.json({ depositantes: await arm.resumo(), bases: arm.BASES, pendencias: await arm.pendencias() }), 'Erro.'));
router.get('/estoque', autenticar, pode, rota(async (req, res) => res.json(await arm.estoque(req.query)), 'Erro.'));
router.get('/movimentos', autenticar, pode, rota(async (req, res) => res.json(await arm.movimentos(req.query)), 'Erro.'));
router.get('/movimentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await arm.movimento(Number(req.params.id))), 'Erro.'));
router.get('/movimentos/:id(\\d+)/imprimir', autenticar, pode, async (req, res) => {
  try { res.set('Content-Type', 'text/html; charset=utf-8').send(await arm.documentoHtml(Number(req.params.id))); } catch (err) { res.status(err.status || 400).send(String(err.message).replace(/</g, '&lt;')); }
});
router.post('/entrada/xml', autenticar, pode, express.text({ type: '*/*', limit: '5mb' }), rota(async (req, res) => res.json(await arm.previaXml(req.body)), 'XML inválido.'));
router.post('/entrada', autenticar, pode, rota(async (req, res) => {
  const m = await arm.registrarEntrada(req.body || {}, req.usuario);
  log(req, `Entrada no armazém nº ${m.id} — ${m.depositante_nome || m.depositante_doc}${m.nf_numero ? ` (NF ${m.nf_numero})` : ''}`);
  res.status(201).json(m);
}, 'Erro na entrada.'));
router.post('/saida', autenticar, pode, rota(async (req, res) => {
  const m = await arm.registrarSaida(req.body || {}, req.usuario);
  log(req, `Saída do armazém nº ${m.id} — ${m.depositante_nome || m.depositante_doc} (${m.itens} item(ns))`);
  res.status(201).json(m);
}, 'Erro na saída.'));
router.post('/ajuste', autenticar, pode, rota(async (req, res) => {
  const m = await arm.ajustar(req.body || {}, req.usuario);
  log(req, `Ajuste de inventário nº ${m.id} — ${m.observacao}`);
  res.status(201).json(m);
}, 'Erro no ajuste.'));
router.post('/movimentos/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  await arm.cancelarMovimento(Number(req.params.id), req.body?.motivo, req.usuario);
  log(req, `Cancelou o movimento do armazém nº ${req.params.id}: ${req.body?.motivo || ''}`);
  res.json({ ok: true });
}, 'Erro ao cancelar.'));
router.get('/contratos', autenticar, pode, rota(async (req, res) => res.json(await arm.contratos()), 'Erro.'));
router.post('/contratos', autenticar, financeiro, rota(async (req, res) => { const c = await arm.salvarContrato(null, req.body || {}); log(req, `Contrato de armazenagem de ${c.depositante_nome}`); res.status(201).json(c); }, 'Erro ao salvar.'));
router.put('/contratos/:id(\\d+)', autenticar, financeiro, rota(async (req, res) => { const c = await arm.salvarContrato(Number(req.params.id), req.body || {}); log(req, `Alterou o contrato de armazenagem de ${c.depositante_nome}`); res.json(c); }, 'Erro ao salvar.'));
router.get('/cobranca', autenticar, pode, rota(async (req, res) => res.json(await arm.cobrancas(String(req.query.competencia || ''))), 'Erro.'));
router.get('/cobranca/:id(\\d+)/medicao', autenticar, pode, rota(async (req, res) => {
  const c = (await arm.contratos()).find((x) => x.id === Number(req.params.id));
  if (!c) return res.status(404).json({ erro: 'Contrato não encontrado.' });
  return res.json(await arm.medicao(c, String(req.query.competencia || '')));
}, 'Erro.'));
router.post('/cobranca', autenticar, financeiro, rota(async (req, res) => {
  const r = await arm.gerarCobranca(Number(req.body?.contrato_id), String(req.body?.competencia || ''), req.usuario);
  log(req, `Cobrança de armazenagem ${req.body?.competencia}: R$ ${r.valor.toFixed(2)} (NFS-e #${r.nfse_id})`);
  res.status(201).json(r);
}, 'Erro ao gerar a cobrança.'));
router.post('/cobranca/:id(\\d+)/cancelar', autenticar, financeiro, rota(async (req, res) => { await arm.cancelarCobranca(Number(req.params.id)); log(req, `Cancelou a cobrança de armazenagem #${req.params.id}`); res.json({ ok: true }); }, 'Erro.'));
router.get('/pedidos', autenticar, pode, rota(async (req, res) => res.json(await arm.pedidos(req.query)), 'Erro.'));
router.post('/pedidos/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => { await arm.cancelarPedido(Number(req.params.id), req.body?.motivo); res.json({ ok: true }); }, 'Erro.'));

module.exports = router;
