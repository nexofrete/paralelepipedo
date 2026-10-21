// Controle de paletes (regras em src/paletes.js): saldos, vales-palete, lançamentos,
// cobrança por nota de débito. Operação (quem emite CT-e) lança; cobrar pede o financeiro.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const paletes = require('../paletes');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const financeiro = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'paletes', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[paletes]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};
const pagina = (fn) => async (req, res) => {
  try { res.set('Content-Type', 'text/html; charset=utf-8').send(await fn(req)); } catch (err) { res.status(err.status || 400).send(String(err.message || 'Erro.').replace(/</g, '&lt;')); }
};

router.get('/', autenticar, pode, rota(async (req, res) => res.json({ ...(await paletes.saldos({ busca: req.query.busca, todos: req.query.todos === '1' })), tipos: paletes.TIPOS }), 'Erro.'));
router.get('/vales', autenticar, pode, rota(async (req, res) => res.json(await paletes.vales(req.query)), 'Erro.'));
router.get('/extrato/:chave', autenticar, pode, rota(async (req, res) => res.json(await paletes.extrato(String(req.params.chave).slice(0, 200))), 'Erro.'));
router.get('/notas', autenticar, pode, rota(async (req, res) => res.json(await paletes.notas()), 'Erro.'));
router.get('/config', autenticar, pode, rota(async (req, res) => res.json({ ...(await paletes.config()), tipos: paletes.TIPOS }), 'Erro.'));
router.put('/config', autenticar, financeiro, rota(async (req, res) => { const c = await paletes.salvarConfig(req.body || {}); log(req, 'Alterou os valores e o prazo dos paletes'); res.json(c); }, 'Erro ao salvar.'));
router.post('/movimentos', autenticar, pode, rota(async (req, res) => {
  const m = await paletes.lancar(req.body || {}, req.usuario);
  log(req, `Lançou ${paletes.ORIGENS[m.origem]} de ${m.quantidade} palete(s) ${m.tipo_palete} — ${m.parte_nome}${m.vales_baixados.length ? ` (baixou ${m.vales_baixados.length} vale(s))` : ''}`);
  res.status(201).json(m);
}, 'Erro ao lançar.'));
router.delete('/movimentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const m = await paletes.excluirMovimento(Number(req.params.id));
  log(req, `Excluiu o lançamento de ${m.quantidade} palete(s) — ${m.parte_nome}`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));
router.post('/vales/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  await paletes.cancelarVale(Number(req.params.id), req.body?.motivo, req.usuario);
  log(req, `Cancelou o vale-palete #${req.params.id}: ${req.body?.motivo || ''}`);
  res.json({ ok: true });
}, 'Erro ao cancelar.'));
router.get('/vales/:id(\\d+)/imprimir', autenticar, pode, pagina((req) => paletes.valeHtml(Number(req.params.id))));
router.post('/cobrar', autenticar, financeiro, rota(async (req, res) => {
  const notas = await paletes.cobrar(req.body?.ids, req.usuario);
  log(req, `Cobrou paletes: ${notas.map((n) => `nota de débito ${n.numero} (${n.tomador_nome}, R$ ${n.valor.toFixed(2)})`).join('; ')}`);
  res.status(201).json({ notas });
}, 'Erro ao cobrar.'));
router.post('/notas/:id(\\d+)/cancelar', autenticar, financeiro, rota(async (req, res) => {
  await paletes.cancelarNota(Number(req.params.id), req.body?.motivo);
  log(req, `Cancelou a nota de débito #${req.params.id}: ${req.body?.motivo || ''}`);
  res.json({ ok: true });
}, 'Erro ao cancelar.'));
router.get('/notas/:id(\\d+)/imprimir', autenticar, pode, pagina((req) => paletes.notaHtml(Number(req.params.id))));

module.exports = router;
