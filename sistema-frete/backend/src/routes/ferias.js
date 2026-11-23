// Pessoas (RH): funcionários e férias (telas 270 a 272). Regras em src/ferias.js.
// Só para quem pode ver dados de pessoas: administrador, quem gerencia usuários ou quem tem a tela na grade de acesso.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const fe = require('../ferias');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[férias]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const pode = (req, res, next) => (fe.pode(req.usuario) ? next() : res.status(403).json({ erro: 'Sem acesso a Pessoas (RH).' }));
const rota = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { erro(res, err, 'Erro em Férias.'); } };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'ferias', detalhes });
const usuario = (req) => req.usuario?.nome || 'Usuário';

router.use(autenticar, pode);
router.get('/', rota(() => fe.painel()));
router.get('/funcionarios', rota((req) => fe.funcionarios({ todos: req.query.todos === '1' })));
router.post('/funcionarios', rota(async (req) => { const f = await fe.salvarFuncionario(null, req.body || {}); log(req, `Cadastrou o funcionário ${f.nome}`); return f; }));
router.put('/funcionarios/:id(\\d+)', rota(async (req) => { const f = await fe.salvarFuncionario(Number(req.params.id), req.body || {}); log(req, `Alterou o funcionário ${f.nome}`); return f; }));
router.post('/', rota(async (req) => { const r = await fe.salvarFerias(null, req.body || {}, usuario(req)); log(req, `Programou férias (#${r.id})`); return r; }));
router.put('/:id(\\d+)', rota(async (req) => { const r = await fe.salvarFerias(Number(req.params.id), req.body || {}, usuario(req)); log(req, `Alterou as férias #${r.id}`); return r; }));
router.post('/:id(\\d+)/:acao(aprovar|cancelar|aviso)', rota(async (req) => { const r = await fe.mudarFerias(Number(req.params.id), req.params.acao, usuario(req)); log(req, `Férias #${req.params.id}: ${req.params.acao}`); return r; }));
router.get('/:id(\\d+)/aviso', async (req, res) => { try { res.type('html').send(await fe.documentoAviso(Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao montar o aviso.'); } });
router.get('/config', rota(() => fe.config()));
router.put('/config', rota((req) => fe.salvarConfig(req.body || {})));

module.exports = router;
