// SAC com protocolo (regras em src/sac.js): fila de chamados, conversa com o
// cliente, prazos (SLA) e indicadores. Quem emite CT-e ou vê o financeiro atende.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const sac = require('../sac');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'sac', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[sac]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};

router.get('/', autenticar, pode, rota(async (req, res) => {
  const r = await sac.listar({ filtro: req.query.filtro, busca: req.query.busca, usuarioId: req.usuario.id });
  res.json({ ...r, assuntos: sac.ASSUNTOS, prioridades: sac.PRIORIDADES, status: sac.STATUS, origens: sac.ORIGENS });
}, 'Erro ao listar.'));
router.get('/indicadores', autenticar, pode, rota(async (req, res) => res.json(await sac.indicadores()), 'Erro.'));
router.get('/usuarios', autenticar, pode, rota(async (req, res) => res.json((await pool.query('SELECT id, nome FROM usuarios WHERE ativo ORDER BY nome')).rows), 'Erro.'));
router.get('/config', autenticar, pode, rota(async (req, res) => res.json(await sac.config()), 'Erro.'));
router.put('/config', autenticar, permitirAlguma('pode_ver_financeiro', 'pode_emitir_cte'), rota(async (req, res) => {
  const c = await sac.salvarConfig(req.body || {});
  log(req, 'Alterou os prazos e avisos do SAC');
  res.json(c);
}, 'Erro ao salvar.'));
router.get('/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await sac.detalhe(Number(req.params.id))), 'Erro.'));
router.post('/', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const ch = await sac.abrir({ ...b, origem: b.origem === 'telefone' ? 'telefone' : 'interno' }, { usuario: b.assumir === false ? null : req.usuario });
  log(req, `Abriu o chamado ${ch.protocolo} (${ch.titulo})`);
  res.status(201).json(ch);
}, 'Erro ao abrir o chamado.'));
router.post('/:id(\\d+)/responder', autenticar, pode, rota(async (req, res) => {
  const r = await sac.responder(Number(req.params.id), req.body || {}, req.usuario);
  res.json(r);
}, 'Erro ao responder.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const ch = await sac.alterar(Number(req.params.id), req.body || {}, req.usuario);
  log(req, `Alterou o chamado ${ch.protocolo}`);
  res.json(ch);
}, 'Erro ao alterar.'));

module.exports = router;
