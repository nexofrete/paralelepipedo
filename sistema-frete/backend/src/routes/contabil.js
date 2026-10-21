// Fiscal e contabilidade: livro de saídas, lançamentos contábeis e o pacote do contador.
const fs = require('fs');
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const contabil = require('../contabil');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'contabil', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[contabil]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const dia = (v) => String(v).split('-').reverse().join('/');
const empresa = async () => (await pool.query('SELECT razao_social, cnpj, ie FROM empresa WHERE id = 1')).rows[0] || {};

router.get('/config', autenticar, pode, rota(async (req, res) => res.json({ ...(await contabil.config()), nomes: contabil.NOMES_CONTAS, padrao: contabil.CONTAS_PADRAO, periodo: contabil.mesAnterior() }), 'Erro.'));
router.put('/config', autenticar, pode, rota(async (req, res) => {
  const c = await contabil.salvarConfig(req.body || {});
  log(req, `Configurou a contabilidade (regime de ${c.regime}${c.contador_email ? `, contador ${c.contador_email}` : ''}, envio automático ${c.envio_ativo ? `dia ${c.envio_dia}` : 'desligado'})`);
  res.json(c);
}, 'Erro ao salvar.'));

router.get('/livro', autenticar, pode, rota(async (req, res) => res.json(await contabil.livroSaidas(req.query)), 'Erro ao montar o livro.'));
router.get('/livro.html', autenticar, pode, rota(async (req, res) => {
  res.type('html').send(contabil.livroHtml(await contabil.livroSaidas(req.query), await empresa()));
}, 'Erro ao montar o livro.'));
router.get('/livro.csv', autenticar, pode, rota(async (req, res) => {
  const l = await contabil.livroSaidas(req.query);
  res.attachment(`livro-de-saidas-${l.periodo.de}-a-${l.periodo.ate}.csv`).type('text/csv; charset=utf-8').send(contabil.csvLivro(l));
}, 'Erro.'));

router.get('/lancamentos', autenticar, pode, rota(async (req, res) => res.json(await contabil.lancamentos(req.query)), 'Erro ao montar os lançamentos.'));
router.get('/lancamentos.csv', autenticar, pode, rota(async (req, res) => {
  const r = await contabil.lancamentos(req.query);
  const cfg = await contabil.config();
  res.attachment(`lancamentos-contabeis-${r.periodo.de}-a-${r.periodo.ate}.csv`).type('text/csv; charset=utf-8').send(contabil.csvLancamentos(r, req.query.separador || cfg.separador));
}, 'Erro.'));

router.get('/pacote.zip', autenticar, pode, rota(async (req, res) => {
  const p = await contabil.montarPacote(req.query);
  const per = contabil.periodo(req.query);
  log(req, `Baixou o pacote do contador de ${dia(per.de)} a ${dia(per.ate)} (${p.contagem.cte} CT-e, ${p.contagem.mdfe} MDF-e, ${p.contagem.nfse} NFS-e)`);
  res.download(p.arquivo, p.nome, () => fs.rm(p.arquivo, { force: true }, () => {}));
}, 'Erro ao montar o pacote.'));

router.post('/enviar', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const r = await contabil.enviarPacoteManual({ de: b.de, ate: b.ate }, { para: b.para });
  const per = contabil.periodo(b);
  log(req, `Enviou o pacote do contador (${dia(per.de)} a ${dia(per.ate)}) para ${r.para}`);
  res.json(r);
}, 'Erro ao enviar o pacote.'));

// ---------- Notas de entrada (regras em src/entradas.js) ----------
const entradas = require('../entradas');
router.get('/entradas', autenticar, pode, rota(async (req, res) => {
  const { rows: [e] } = await pool.query('SELECT crt, contabil_config FROM empresa WHERE id = 1');
  res.json({ ...(await entradas.listar(req.query)), categorias: require('../contasPagar').CATEGORIAS, modo_credito: await entradas.modoCredito(e), modos: entradas.MODOS_CREDITO });
}, 'Erro ao listar as notas de entrada.'));
router.post('/entradas/previa', autenticar, pode, rota(async (req, res) => res.json(await entradas.previa(req.body?.xml)), 'Erro ao ler o XML.'));
router.post('/entradas', autenticar, pode, rota(async (req, res) => {
  const r = await entradas.lancar(req.body || {}, req.usuario.nome);
  log(req, `Lançou a nota de entrada ${r.numero} de ${r.fornecedor} (R$ ${r.valor.toFixed(2)}${r.credito ? `, crédito de ICMS R$ ${r.credito.toFixed(2)}` : ''}${r.contas.length ? `, ${r.contas.length} conta(s) a pagar` : ''})`);
  res.status(201).json(r);
}, 'Erro ao lançar a nota.'));
router.get('/entradas/livro', autenticar, pode, rota(async (req, res) => {
  const p = contabil.periodo(req.query);
  res.json({ livro: await entradas.livroEntradas(p), apuracao: await entradas.apuracao(p) });
}, 'Erro ao montar o livro de entradas.'));
router.get('/entradas/livro.html', autenticar, pode, rota(async (req, res) => {
  const p = contabil.periodo(req.query);
  res.type('html').send(entradas.livroHtml(await entradas.livroEntradas(p), await entradas.apuracao(p), await empresa()));
}, 'Erro ao montar o livro de entradas.'));
router.get('/entradas/livro.csv', autenticar, pode, rota(async (req, res) => {
  const l = await entradas.livroEntradas(contabil.periodo(req.query));
  res.attachment(`livro-de-entradas-${l.periodo.de}-a-${l.periodo.ate}.csv`).type('text/csv; charset=utf-8').send(entradas.csvLivro(l));
}, 'Erro.'));
router.get('/entradas/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await entradas.detalhe(Number(req.params.id))), 'Erro ao abrir a nota.'));
router.get('/entradas/:id(\\d+)/xml', autenticar, pode, rota(async (req, res) => {
  const { rows } = await pool.query('SELECT chave, xml FROM notas_entrada WHERE id = $1', [req.params.id]);
  if (!rows[0]?.xml) return res.status(404).json({ erro: 'Esta nota não tem XML.' });
  res.attachment(`${rows[0].chave}.xml`).type('application/xml').send(rows[0].xml);
}, 'Erro.'));
router.post('/entradas/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  const n = await entradas.cancelar(Number(req.params.id), req.body?.motivo);
  log(req, `Cancelou a nota de entrada ${n.numero} de ${n.emitente_nome}: ${String(req.body?.motivo || '').slice(0, 200)}`);
  res.json({ ok: true });
}, 'Erro ao cancelar a nota.'));

// ---------- NF-e contra o CNPJ (SEFAZ: Distribuição DF-e e manifestação; regras em src/dfe.js) ----------
const dfe = require('../dfe');
router.get('/dfe', autenticar, pode, rota(async (req, res) => res.json({ ...(await dfe.estado()), ...(await dfe.listar(req.query)) }), 'Erro ao listar as NF-e recebidas.'));
router.put('/dfe/config', autenticar, pode, rota(async (req, res) => {
  const c = await dfe.salvarConfig(req.body || {});
  log(req, `Busca automática de NF-e na SEFAZ ${c.ativo ? 'ligada' : 'desligada'}${c.ciencia_automatica ? ', com ciência automática' : ''}`);
  res.json(c);
}, 'Erro ao salvar.'));
router.post('/dfe/consultar', autenticar, pode, rota(async (req, res) => {
  const r = await dfe.consultar();
  log(req, `Buscou NF-e na SEFAZ: ${r.novos} nova(s), ${r.atualizados} atualizada(s) (NSU ${r.ult_nsu}/${r.max_nsu})`);
  res.json(r);
}, 'Erro ao consultar a SEFAZ.'));
router.post('/dfe/:id(\\d+)/manifestar', autenticar, pode, rota(async (req, res) => {
  const r = await dfe.manifestar(Number(req.params.id), req.body?.tipo, { justificativa: req.body?.justificativa });
  log(req, `Manifestou "${r.rotulo}" na NF-e ${r.chave}${r.protocolo ? ` (protocolo ${r.protocolo})` : ''}`);
  res.json(r);
}, 'Erro ao manifestar.'));
router.post('/dfe/:id(\\d+)/baixar', autenticar, pode, rota(async (req, res) => res.json(await dfe.baixarXml(Number(req.params.id))), 'Erro ao baixar o XML.'));
router.post('/dfe/:id(\\d+)/ignorar', autenticar, pode, rota(async (req, res) => { await dfe.ignorar(Number(req.params.id), req.body?.ignorar !== false); res.json({ ok: true }); }, 'Erro.'));
router.get('/dfe/:id(\\d+)/xml', autenticar, pode, rota(async (req, res) => res.json(await dfe.xmlDa(Number(req.params.id))), 'Erro.'));

module.exports = router;
