// Cadastros básicos (regras em src/cadastrosBasicos.js).
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const cb = require('../cadastrosBasicos');

const router = express.Router();
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[cadastros]', err); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); }
};
const nomeDo = (tipo, r) => r?.[cb.DEFS[tipo].nome] || r?.codigo || `#${r?.id}`;

router.get('/', autenticar, rota(async (req, res) => res.json(cb.paraTela(req)), 'Erro.'));
router.get('/opcoes/:fonte', autenticar, rota(async (req, res) => res.json(await cb.opcoes(req, req.params.fonte)), 'Erro ao carregar a lista.'));
router.get('/regiao', autenticar, rota(async (req, res) => res.json(await cb.regiaoDe(req.query)), 'Erro.'));
router.post('/fornecedores/importar', autenticar, rota(async (req, res) => {
  const r = await cb.importarFornecedores(req);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cadastro_basico', detalhes: `Importou ${r.novos} fornecedor(es) dos lançamentos (${r.contas_ligadas} conta(s) a pagar ligadas)` });
  res.json(r);
}, 'Erro ao importar.'));
router.get('/:tipo', autenticar, rota(async (req, res) => res.json(await cb.listar(req, req.params.tipo, req.query)), 'Erro ao listar.'));
router.post('/:tipo', autenticar, rota(async (req, res) => {
  const r = await cb.salvar(req, req.params.tipo, null, req.body || {});
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cadastro_basico', detalhes: `Cadastrou ${cb.DEFS[req.params.tipo].titulo.toLowerCase()}: ${nomeDo(req.params.tipo, r)}` });
  res.status(201).json(r);
}, 'Erro ao salvar.'));
router.put('/:tipo/:id(\\d+)', autenticar, rota(async (req, res) => {
  const r = await cb.salvar(req, req.params.tipo, Number(req.params.id), req.body || {});
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cadastro_basico', detalhes: `Alterou ${cb.DEFS[req.params.tipo].titulo.toLowerCase()}: ${nomeDo(req.params.tipo, r)}` });
  res.json(r);
}, 'Erro ao salvar.'));
router.delete('/:tipo/:id(\\d+)', autenticar, rota(async (req, res) => {
  await cb.excluir(req, req.params.tipo, Number(req.params.id));
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cadastro_basico', detalhes: `Excluiu de ${cb.DEFS[req.params.tipo].titulo.toLowerCase()} o registro #${req.params.id}` });
  res.json({ ok: true });
}, 'Erro ao excluir.'));

module.exports = router;
