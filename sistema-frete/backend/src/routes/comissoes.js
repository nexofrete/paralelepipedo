// Comissão de vendedores: cadastro, carteira, apuração e fechamentos.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const com = require('../comissoes');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'comissao', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[comissões]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (v) => String(v || '').slice(0, 10).split('-').reverse().join('/');

router.get('/vendedores', autenticar, pode, rota(async (req, res) => res.json({ vendedores: await com.listarVendedores({ todos: req.query.todos === '1' }), bases: com.BASES }), 'Erro.'));
router.post('/vendedores', autenticar, pode, rota(async (req, res) => {
  const v = await com.criarVendedor(req.body || {});
  log(req, `Cadastrou o vendedor ${v.nome} (${Number(v.comissao_pct)}% ${v.base === 'faturado' ? 'sobre o faturado' : 'sobre o recebido'})`);
  res.status(201).json(v);
}, 'Erro ao salvar.'));
router.put('/vendedores/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const v = await com.alterarVendedor(Number(req.params.id), req.body || {});
  log(req, `Alterou o vendedor ${v.nome}: ${Number(v.comissao_pct)}% ${v.base === 'faturado' ? 'sobre o faturado' : 'sobre o recebido'}${v.ativo ? '' : ' (inativo)'}`);
  res.json(v);
}, 'Erro ao salvar.'));

router.get('/carteira', autenticar, pode, rota(async (req, res) => res.json(await com.carteira()), 'Erro.'));
router.put('/carteira', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const n = await com.definirCarteira(b.documentos, b);
  log(req, `Carteira: ${n} cliente(s) ${b.vendedor_id ? `para o vendedor ${b.vendedor_id}` : 'sem vendedor'}${String(b.comissao_pct ?? '').trim() !== '' ? ` com ${b.comissao_pct}% próprio` : ''}`);
  res.json({ ok: true, clientes: n });
}, 'Erro ao salvar.'));

router.get('/apuracao', autenticar, pode, rota(async (req, res) => res.json(await com.apurar({ de: req.query.de, ate: req.query.ate, vendedorId: req.query.vendedor })), 'Erro na apuração.'));
router.post('/fechar', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const f = await com.fechar(Number(b.vendedor_id), b, req.usuario.nome);
  log(req, `Fechou a comissão de ${f.vendedor} de ${dia(f.de instanceof Date ? f.de.toISOString() : f.de)} a ${dia(f.ate instanceof Date ? f.ate.toISOString() : f.ate)}: ${brl(f.total)} (${f.itens} documento(s)${f.estornos ? `, ${f.estornos} estorno(s)` : ''}) — conta a pagar ${f.conta_pagar_id}`);
  res.status(201).json(f);
}, 'Erro ao fechar.'));
router.get('/fechamentos', autenticar, pode, rota(async (req, res) => res.json(await com.fechamentos({ vendedorId: Number(req.query.vendedor) || null })), 'Erro.'));
router.get('/fechamentos/:id(\\d+)/itens', autenticar, pode, rota(async (req, res) => res.json(await com.itensDoFechamento(Number(req.params.id))), 'Erro.'));
router.post('/fechamentos/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  const f = await com.cancelarFechamento(Number(req.params.id));
  log(req, `Cancelou o fechamento de comissão ${f.id} (${brl(f.total)}); a conta a pagar foi cancelada e os documentos voltaram para a apuração`);
  res.json({ ok: true });
}, 'Erro ao cancelar.'));
router.put('/documentos/:tipo(cte|nfse)/:id(\\d+)/vendedor', autenticar, pode, rota(async (req, res) => {
  await com.vendedorDoDocumento(req.params.tipo, Number(req.params.id), req.body?.vendedor_id);
  log(req, `Trocou o vendedor do ${req.params.tipo === 'cte' ? 'CT-e' : 'NFS-e'} ${req.params.id} para ${req.body?.vendedor_id || 'o do cliente'}`);
  res.json({ ok: true });
}, 'Erro.'));

module.exports = router;
