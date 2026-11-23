// Cargas (embarcador): embarques, pré-conhecimentos, cargas fracionadas × lotação e capacidade das transportadoras.
// Regras em src/cargas.js. Acesso pela grade de telas (tela "cargas").
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const c = require('../cargas');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[cargas]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const usuario = (req) => req.usuario?.nome || 'Usuário';
const rota = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { erro(res, err, 'Erro em Cargas.'); } };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cargas', detalhes });
const html = (fn) => async (req, res) => { try { res.type('html').send(await fn(req)); } catch (err) { erro(res, err, 'Erro ao montar o documento.'); } };
async function origem(req) {
  const { rows } = await pool.query('SELECT endereco_publico FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return String(rows[0]?.endereco_publico || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const ids = (v) => String(v || '').split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);

router.get('/veiculos', autenticar, (req, res) => res.json(c.VEICULOS));
router.get('/candidatas', autenticar, rota((req) => c.candidatas(req, req.query, { exceto: Number(req.query.exceto) || 0 })));
// Embarques
router.get('/embarques', autenticar, rota((req) => c.embarques(req.query)));
router.get('/embarques/:id(\\d+)', autenticar, rota((req) => c.embarque(Number(req.params.id))));
router.post('/embarques', autenticar, rota(async (req) => { const e = await c.salvarEmbarque(req, null, req.body || {}, usuario(req)); log(req, `Montou o embarque ${e.id} (${e.transportadora}, ${e.notas.length} nota(s))`); return e; }));
router.put('/embarques/:id(\\d+)', autenticar, rota(async (req) => { const e = await c.salvarEmbarque(req, Number(req.params.id), req.body || {}, usuario(req)); log(req, `Alterou o embarque ${e.id}`); return e; }));
router.post('/embarques/:id(\\d+)/fechar', autenticar, rota(async (req) => { const e = await c.fecharEmbarque(req, Number(req.params.id), usuario(req)); log(req, `Fechou o embarque ${e.id} (${e.pre_gerados} pré-conhecimento(s))`); return e; }));
router.post('/embarques/:id(\\d+)/cancelar', autenticar, rota(async (req) => { const e = await c.cancelarEmbarque(Number(req.params.id)); log(req, `Cancelou o embarque ${e.id}`); return e; }));
router.post('/embarques/:id(\\d+)/ordem', autenticar, rota(async (req) => { const e = await c.ordemDoEmbarque(req, Number(req.params.id), req.body || {}, usuario(req), await origem(req)); log(req, `Pediu a coleta do embarque ${e.id} (ordem ${e.ordem})`); return e; }));
router.get('/embarques/:id(\\d+)/documento', autenticar, html((req) => c.documentoEmbarque(req, Number(req.params.id))));
// Pré-conhecimentos
router.get('/pre', autenticar, rota((req) => c.preConhecimentos(req, req.query)));
router.get('/pre/sem', autenticar, rota((req) => c.semPre(req, req.query)));
router.post('/pre', autenticar, rota(async (req) => { const n = await c.gerarPre(req, ids((req.body?.frete_ids || []).join(',')), usuario(req)); log(req, `Gerou ${n.length} pré-conhecimento(s)`); return { gerados: n.length }; }));
router.post('/pre/:id(\\d+)/cancelar', autenticar, rota((req) => c.cancelarPre(Number(req.params.id))));
router.get('/pre/documento', autenticar, html((req) => c.documentoPre(req, ids(req.query.ids))));
router.post('/pre/enviar', autenticar, rota(async (req) => { const r = await c.enviarPre(req, ids((req.body?.ids || []).join(',')), req.body?.para, usuario(req)); log(req, `Mandou ${r.enviados} pré-conhecimento(s) para ${req.body?.para}`); return r; }));
// Cargas fracionadas e tabelas de lotação
router.get('/fracionadas', autenticar, rota((req) => c.fracionadas(req, req.query)));
router.get('/lotacoes', autenticar, rota(() => c.lotacoes({ todas: true })));
router.post('/lotacoes', autenticar, rota((req) => c.salvarLotacao(null, req.body || {})));
router.put('/lotacoes/:id(\\d+)', autenticar, rota((req) => c.salvarLotacao(Number(req.params.id), req.body || {})));
router.delete('/lotacoes/:id(\\d+)', autenticar, rota((req) => c.excluirLotacao(Number(req.params.id))));
// Capacidade
router.get('/capacidade', autenticar, rota((req) => c.painelCapacidade(req.query)));
router.post('/capacidades', autenticar, rota((req) => c.salvarCapacidade(null, req.body || {})));
router.put('/capacidades/:id(\\d+)', autenticar, rota((req) => c.salvarCapacidade(Number(req.params.id), req.body || {})));
router.delete('/capacidades/:id(\\d+)', autenticar, rota((req) => c.excluirCapacidade(Number(req.params.id))));

module.exports = router;
