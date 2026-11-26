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
router.post('/testar-os', autenticar, soAdmin, rota((req) => wms.testarOs(req.body?.expedicao)));
router.post('/testar-separacao', autenticar, soAdmin, rota((req) => wms.testarSeparacao(req.body?.expedicao)));
// Situação da ligação (tela Pedidos) e "Atualizar do WMS" (quem edita registros; no máximo 1 a cada 2 minutos).
router.get('/situacao', autenticar, rota(() => wms.situacao()));
let ultimaManual = 0;
router.post('/consultar', autenticar, rota(async (req) => {
  if (!(req.usuario?.perfil === 'admin' || req.usuario?.pode_editar_registros)) throw Object.assign(new Error('Sem permissão para consultar o WMS.'), { status: 403 });
  // Integração pausada: o "Atualizar do WMS" não consulta (o teste da janela de configuração, sim).
  if (!req.body?.teste && !(await wms.situacao()).ativo) throw Object.assign(new Error('A integração com o WMS está pausada. Clique em "Retomar integração" para voltar a consultar.'), { status: 409 });
  if (Date.now() - ultimaManual < 120000) throw Object.assign(new Error('O WMS foi consultado há menos de 2 minutos. Espere um pouco.'), { status: 429 });
  ultimaManual = Date.now();
  const r = await wms.consultar({ origem: `manual: ${req.usuario.nome}` });
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'consultar_wms', detalhes: r.msg });
  return r;
}));
// Pausar / retomar (quem edita registros ou o administrador).
router.post('/pausar', autenticar, rota(async (req) => {
  if (!(req.usuario?.perfil === 'admin' || req.usuario?.pode_editar_registros)) throw Object.assign(new Error('Sem permissão para pausar a integração com o WMS.'), { status: 403 });
  const ativo = !!req.body?.ativo;
  const r = await wms.pausar(ativo);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'config_wms', detalhes: ativo ? 'Retomou a integração com o WMS' : 'Pausou a integração com o WMS' });
  return r;
}));
// Um pedido na hora (o "🔎 buscar" da linha) e a busca completa em segundo plano (quem edita registros).
const podeConsultar = async (req) => {
  if (!(req.usuario?.perfil === 'admin' || req.usuario?.pode_editar_registros)) throw Object.assign(new Error('Sem permissão para consultar o WMS.'), { status: 403 });
  if (!(await wms.situacao()).ativo) throw Object.assign(new Error('A integração com o WMS está pausada.'), { status: 409 });
};
const ultimaCarga = new Map();
router.post('/consultar-carga', autenticar, rota(async (req) => {
  await podeConsultar(req);
  if (Date.now() - (ultimaCarga.get(req.usuario.id) || 0) < 1000) throw Object.assign(new Error('Espere um segundo entre uma busca e outra.'), { status: 429 });
  ultimaCarga.set(req.usuario.id, Date.now());
  return wms.consultarCarga(req.body?.carga);
}));
router.post('/buscar-todos', autenticar, rota(async (req) => {
  await podeConsultar(req);
  const r = await wms.buscarTodos(`manual: ${req.usuario.nome}`);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'consultar_wms', detalhes: r.msg });
  return r;
}));
module.exports = router;
