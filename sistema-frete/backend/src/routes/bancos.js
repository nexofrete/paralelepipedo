// Caixa e bancos: contas, movimentação, extrato OFX, conciliação e fluxo de caixa.
const express = require('express');
const multer = require('multer');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const bancos = require('../bancos/bancos');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'bancos', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[bancos]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (v) => String(v || '').split('-').reverse().join('/');

// Só nome e tipo: para escolher a conta ao receber/pagar (quem emite CT-e também recebe fatura).
router.get('/contas/opcoes', autenticar, permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro'), rota(async (req, res) => {
  const { contas } = await bancos.listarContas();
  res.json(contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, padrao: c.padrao })));
}, 'Erro.'));
router.get('/contas', autenticar, pode, rota(async (req, res) => res.json(await bancos.listarContas({ todas: req.query.todas === '1' })), 'Erro ao listar as contas.'));
router.post('/contas', autenticar, pode, rota(async (req, res) => {
  const c = await bancos.criarConta(req.body || {});
  log(req, `Criou a conta ${c.nome} (${bancos.TIPOS[c.tipo]}) com saldo inicial de ${brl(c.saldo_inicial)} em ${dia(c.saldo_inicial_data)}`);
  res.status(201).json(c);
}, 'Erro ao criar a conta.'));
router.put('/contas/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const c = await bancos.alterarConta(Number(req.params.id), req.body || {});
  log(req, `Alterou a conta ${c.nome}: saldo inicial ${brl(c.saldo_inicial)} em ${dia(c.saldo_inicial_data)}${c.ativo ? '' : ' (inativa)'}`);
  res.json(c);
}, 'Erro ao salvar a conta.'));

router.get('/contas/:id(\\d+)/movimentos', autenticar, pode, rota(async (req, res) => res.json(await bancos.movimentos(Number(req.params.id), req.query)), 'Erro.'));
router.post('/movimentos', autenticar, pode, rota(async (req, res) => {
  const m = await bancos.lancar(req.body || {}, req.usuario.nome);
  log(req, m.categoria === 'transferencia' ? `Transferiu ${brl(m.valor)} de ${m.conta.nome} para ${m.destino.nome} em ${dia(m.data)}`
    : `Lançou ${m.valor > 0 ? 'entrada' : 'saída'} de ${brl(Math.abs(m.valor))} (${bancos.CATEGORIAS[m.categoria]}) em ${m.conta.nome}, ${dia(m.data)}`);
  res.status(201).json(m);
}, 'Erro ao lançar.'));
router.delete('/movimentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const m = await bancos.excluirMovimento(Number(req.params.id));
  log(req, `Excluiu o lançamento de ${brl(Math.abs(m.valor))} (${bancos.CATEGORIAS[m.categoria] || m.categoria}) de ${dia(String(m.data instanceof Date ? m.data.toISOString() : m.data).slice(0, 10))}`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));

router.post('/contas/:id(\\d+)/extrato', autenticar, pode, upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('Escolha o arquivo OFX do extrato.'), { status: 400 });
  const r = await bancos.importarOfx(Number(req.params.id), req.file.buffer, { arquivo: req.file.originalname, usuarioNome: req.usuario.nome });
  const auto = await bancos.conciliarAutomatico(Number(req.params.id), req.usuario.nome);
  log(req, `Importou o extrato ${req.file.originalname} na conta ${r.conta.nome}: ${r.novas} lançamento(s) novo(s), ${auto.conciliadas} conciliado(s) automaticamente`);
  res.json({ ...r, conta: undefined, automaticas: auto.conciliadas });
}, 'Erro ao importar o extrato.'));
router.get('/contas/:id(\\d+)/extrato', autenticar, pode, rota(async (req, res) => res.json(await bancos.extrato(Number(req.params.id), req.query)), 'Erro.'));
router.post('/contas/:id(\\d+)/conciliar-automatico', autenticar, pode, rota(async (req, res) => {
  const r = await bancos.conciliarAutomatico(Number(req.params.id), req.usuario.nome);
  if (r.conciliadas) log(req, `Conciliação automática: ${r.conciliadas} linha(s)`);
  res.json(r);
}, 'Erro.'));

const rotuloAcao = { vincular: 'vinculou a um lançamento', baixar_fatura: 'baixou a fatura', pagar_conta: 'pagou a conta', lancar: 'lançou', ignorar: 'ignorou' };
router.post('/extrato/:id(\\d+)/conciliar', autenticar, pode, rota(async (req, res) => {
  const r = await bancos.conciliar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Conciliação: linha ${req.params.id} do extrato — ${rotuloAcao[r.acao] || r.acao}${r.fatura ? ` ${r.fatura}` : ''}${r.conta ? ` "${r.conta}"` : ''}`);
  res.json(r);
}, 'Erro ao conciliar.'));
// Várias de uma vez (as sugestões marcadas na tela). Segue mesmo se alguma falhar.
router.post('/extrato/conciliar-lote', autenticar, pode, rota(async (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 500) : [];
  const resultado = [];
  for (const it of itens) {
    try { resultado.push({ linha_id: it.linha_id, ok: true, ...(await bancos.conciliar(Number(it.linha_id), it, req.usuario.nome)) }); } catch (e) { resultado.push({ linha_id: it.linha_id, ok: false, erro: e.message }); }
  }
  const ok = resultado.filter((r) => r.ok).length;
  if (ok) log(req, `Conciliação em lote: ${ok} linha(s) do extrato${ok < itens.length ? `, ${itens.length - ok} com erro` : ''}`);
  res.json({ ok, erros: resultado.filter((r) => !r.ok), resultado });
}, 'Erro ao conciliar.'));
router.post('/extrato/:id(\\d+)/desfazer', autenticar, pode, rota(async (req, res) => {
  const r = await bancos.desfazer(Number(req.params.id));
  log(req, `Desfez a conciliação da linha ${req.params.id} do extrato (${r.desfeito})`);
  res.json(r);
}, 'Erro ao desfazer.'));

router.get('/fluxo', autenticar, pode, rota(async (req, res) => res.json(await bancos.fluxo(req.query)), 'Erro ao montar o fluxo de caixa.'));

module.exports = router;
