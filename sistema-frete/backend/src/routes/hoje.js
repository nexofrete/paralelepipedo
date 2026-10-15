// Tela "Hoje": pendências do dia por área, conforme as permissões.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { temAlguma } = require('../permissoes');
const hoje = require('../hoje');

const router = express.Router();
router.get('/', autenticar, async (req, res) => {
  if (!temAlguma(req, 'pode_emitir_cte', 'pode_ver_financeiro')) return res.status(403).json({ erro: 'Você não tem permissão para ver esta tela.' });
  try { return res.json(await hoje.montar(req)); } catch (err) { console.error('[hoje]', err.message); return res.status(500).json({ erro: 'Erro ao montar as pendências do dia.' }); }
});
module.exports = router;
