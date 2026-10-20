// Gerenciamento de risco: consultas de motorista e veículo, regras da apólice e SM da viagem (gr/gr.js).
const express = require('express');
const { autenticar, apenasAdmin, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const gr = require('../gr/gr');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const erro = (res, err, padrao) => { if (!err.status) console.error('[gr]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'gerenciamento_risco', detalhes });
const rota = (fn, padrao) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { erro(res, err, padrao); } };

router.get('/config', autenticar, emitir, rota(async () => ({ config: await gr.config(), provedores: gr.provedores() }), 'Erro ao ler a configuração.'));
router.put('/config', autenticar, apenasAdmin, rota(async (req) => { const c = await gr.salvarConfig(req.body || {}); log(req, `Configurou o gerenciamento de risco (${c.provedor})`); return c; }, 'Erro ao salvar.'));
router.get('/situacoes', autenticar, emitir, rota(() => gr.situacoes(), 'Erro ao consultar.'));
router.post('/consultar', autenticar, emitir, rota(async (req) => {
  const r = await gr.consultar(req.body?.tipo, req.body?.chave, req.usuario.nome);
  log(req, `Consultou na GR ${r.tipo} ${r.chave}: ${r.status}${r.protocolo ? ` (${r.protocolo})` : ''}`);
  return r;
}, 'Erro na consulta da GR.'));
router.post('/consultas/manual', autenticar, emitir, rota(async (req) => {
  const r = await gr.registrarManual(req.body || {}, req.usuario.nome);
  log(req, `Registrou à mão a consulta da GR de ${r.tipo} ${r.chave}: ${r.status}${r.protocolo ? ` (${r.protocolo})` : ''}`);
  return r;
}, 'Erro ao registrar a consulta.'));
router.get('/mdfe/:id(\\d+)', autenticar, emitir, rota((req) => gr.avaliar(Number(req.params.id)), 'Erro ao conferir a viagem.'));
router.put('/mdfe/:id(\\d+)/escolta', autenticar, emitir, rota(async (req) => {
  const r = await gr.marcarEscolta(Number(req.params.id), req.body || {});
  log(req, `${r ? `Marcou escolta (${r.empresa || 'sem empresa'})` : 'Tirou a escolta'} no MDF-e #${req.params.id}`);
  return { escolta: r };
}, 'Erro ao salvar a escolta.'));
router.post('/mdfe/:id(\\d+)/sm', autenticar, emitir, rota(async (req) => {
  const r = await gr.enviarSM(Number(req.params.id), req.usuario.nome);
  log(req, `Enviou a SM ${r.numero} do MDF-e #${req.params.id} (${r.provedor})`);
  return r;
}, 'Erro ao enviar a SM.'));
router.post('/mdfe/:id(\\d+)/sm/cancelar', autenticar, emitir, rota(async (req) => {
  const r = await gr.cancelarSM(Number(req.params.id), req.body?.motivo);
  log(req, `Cancelou a SM do MDF-e #${req.params.id}: ${req.body?.motivo}`);
  return r;
}, 'Erro ao cancelar a SM.'));

module.exports = router;
