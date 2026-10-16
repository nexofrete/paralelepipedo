// Centros de custo: cadastro, resultado por centro e reclassificação das contas.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const cc = require('../centrosCusto');

const router = express.Router();
const ver = permitirAlguma('pode_ver_financeiro', 'pode_emitir_cte');
const pode = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'centro_custo', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[centros de custo]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };

// Lista curta (para o campo "Centro de custo" das contas a pagar).
router.get('/', autenticar, ver, rota(async (req, res) => {
  const pool = require('../db');
  const [centros, { rows: unidades }, { rows: veiculos }] = await Promise.all([cc.listar({ todos: req.query.todos === '1' }),
    pool.query('SELECT id, sigla, nome FROM unidades WHERE ativa ORDER BY matriz DESC, sigla'), pool.query('SELECT id, placa, tipo FROM veiculos WHERE ativo ORDER BY placa')]);
  res.json({ centros, tipos: cc.TIPOS, unidades, veiculos });
}, 'Erro.'));
router.post('/', autenticar, pode, rota(async (req, res) => {
  const c = await cc.criar(req.body || {});
  log(req, `Criou o centro de custo ${c.nome} (${cc.TIPOS[c.tipo]})`);
  res.status(201).json(c);
}, 'Erro ao salvar.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const c = await cc.alterar(Number(req.params.id), req.body || {});
  log(req, `Alterou o centro de custo ${c.nome}${c.ativo ? '' : ' (inativo)'}`);
  res.json(c);
}, 'Erro ao salvar.'));
router.post('/automatico', autenticar, pode, rota(async (req, res) => {
  const r = await cc.criarAutomatico();
  log(req, `Centros de custo automáticos: ${r.filiais} filial(is), ${r.veiculos} veículo(s), ${r.outros} outro(s); ${r.contas} conta(s) antiga(s) classificada(s)`);
  res.json(r);
}, 'Erro.'));
router.get('/resultado', autenticar, pode, rota(async (req, res) => res.json(await cc.resultado(req.query)), 'Erro ao montar o resultado.'));
router.get('/contas', autenticar, pode, rota(async (req, res) => res.json(await cc.contas(req.query)), 'Erro.'));
router.put('/contas', autenticar, pode, rota(async (req, res) => {
  const n = await cc.atribuir(req.body?.conta_ids, Number(req.body?.centro_custo_id) || null);
  log(req, `Reclassificou ${n} conta(s) a pagar para o centro de custo ${req.body?.centro_custo_id || '(nenhum)'}`);
  res.json({ ok: true, contas: n });
}, 'Erro.'));

module.exports = router;
