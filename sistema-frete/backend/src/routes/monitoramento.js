// Monitoramento de veículos (regras em src/monitoramento.js): mapa da frota em rota,
// trajeto e previsão de chegada de cada romaneio, e os limites dos alertas.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const mon = require('../monitoramento');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[monitoramento]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};

router.get('/', autenticar, pode, rota(async (req, res) => res.json(await mon.painel()), 'Erro ao montar o painel.'));
router.get('/config', autenticar, pode, rota(async (req, res) => res.json(await mon.config()), 'Erro.'));
router.put('/config', autenticar, permitirAlguma('pode_emitir_cte'), rota(async (req, res) => {
  const c = await mon.salvarConfig(req.body || {});
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'monitoramento', detalhes: 'Alterou os limites dos alertas do monitoramento' });
  res.json(c);
}, 'Erro ao salvar.'));
router.get('/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await mon.detalhe(Number(req.params.id))), 'Erro.'));

module.exports = router;
