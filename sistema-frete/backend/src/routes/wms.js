// Ligação com o WMS: cadastro e diagnóstico da conexão (só o administrador). Regras em src/wms.js.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const wms = require('../wms');

const router = express.Router();
const soAdmin = (req, res, next) => (req.usuario?.perfil === 'admin' ? next() : res.status(403).json({ erro: 'Só o administrador configura a ligação com o WMS.' }));
const rota = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) { if (!err.status) console.error('[wms]', err.message); res.status(err.status === 401 ? 422 : (err.status || 500)).json({ erro: err.status ? err.message : 'Erro na ligação com o WMS.' }); }
};
router.get('/config', autenticar, soAdmin, rota(() => wms.config()));
router.put('/config', autenticar, soAdmin, rota(async (req) => {
  const r = await wms.salvarConfig(req.body);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'config_wms', detalhes: `Configurou o WMS: ${r.url}${req.body?.senha ? ' (senha alterada)' : ''}` });
  return r;
}));
router.post('/testar', autenticar, soAdmin, rota(() => wms.testar()));
router.post('/testar-tela', autenticar, soAdmin, rota(() => wms.testarTela()));
// Situação da ligação (tela Pedidos) e "Atualizar do WMS" (quem edita registros; no máximo 1 a cada 2 minutos).
router.get('/situacao', autenticar, rota(() => wms.situacao()));
let ultimaManual = 0;
router.post('/consultar', autenticar, rota(async (req) => {
  if (!(req.usuario?.perfil === 'admin' || req.usuario?.pode_editar_registros)) throw Object.assign(new Error('Sem permissão para consultar o WMS.'), { status: 403 });
  if (Date.now() - ultimaManual < 120000) throw Object.assign(new Error('O WMS foi consultado há menos de 2 minutos. Espere um pouco.'), { status: 429 });
  ultimaManual = Date.now();
  const r = await wms.consultar({ origem: `manual: ${req.usuario.nome}` });
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'consultar_wms', detalhes: r.msg });
  return r;
}));
module.exports = router;
