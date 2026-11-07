// NF-e × CT-e (regras em src/nfeCte.js): inconsistências, pesquisa, religar/desligar e aceitar.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const nc = require('../nfeCte');

const router = express.Router();
const ver = permitirAlguma('pode_ver_relatorios', 'pode_ver_auditoria');
const mexer = permitirAlguma('pode_editar_registros', 'pode_aprovar_pagamento');
const log = (req, detalhes, registroId) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'nfe_cte', detalhes, registroId });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[nfe-cte]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); }
};

router.get('/inconsistencias', autenticar, ver, rota(async (req, res) => {
  await nc.cobrirTodos().catch(() => 0);
  res.json(await nc.inconsistencias(req, req.query));
}, 'Erro ao listar as inconsistências.'));
router.get('/pesquisa', autenticar, ver, rota(async (req, res) => res.json(await nc.pesquisar(req, req.query.termo)), 'Erro na pesquisa.'));
router.get('/:id(\\d+)/candidatas', autenticar, mexer, rota(async (req, res) => res.json(await nc.candidatas(req, Number(req.params.id))), 'Erro.'));
router.post('/:id(\\d+)/religar', autenticar, mexer, rota(async (req, res) => {
  const r = await nc.religar(Number(req.params.id), Number(req.body?.nota_id), req.body?.motivo, req.usuario.nome);
  log(req, `Religou o CT-e do registro #${req.params.id} à NF ${r.nota}: ${req.body?.motivo}`, Number(req.body?.nota_id));
  res.json(r);
}, 'Erro ao religar o CT-e.'));
router.post('/:id(\\d+)/desligar', autenticar, mexer, rota(async (req, res) => {
  const r = await nc.desligar(Number(req.params.id), req.body?.motivo, req.usuario.nome);
  log(req, `Desligou o CT-e da nota do registro #${req.params.id} (virou o registro #${r.id}): ${req.body?.motivo}`, Number(req.params.id));
  res.json(r);
}, 'Erro ao desligar o CT-e.'));
router.post('/:id(\\d+)/aceitar', autenticar, mexer, rota(async (req, res) => {
  await nc.aceitar(Number(req.params.id), req.body?.codigo, req.body?.motivo, req.usuario.nome);
  log(req, `Aceitou a inconsistência ${req.body?.codigo} do registro #${req.params.id}: ${req.body?.motivo}`, Number(req.params.id));
  res.json({ ok: true });
}, 'Erro ao aceitar.'));
router.delete('/:id(\\d+)/aceitar/:codigo', autenticar, mexer, rota(async (req, res) => {
  await nc.desfazerAceite(Number(req.params.id), req.params.codigo);
  log(req, `Desfez o aceite da inconsistência ${req.params.codigo} do registro #${req.params.id}`, Number(req.params.id));
  res.json({ ok: true });
}, 'Erro.'));

module.exports = router;
