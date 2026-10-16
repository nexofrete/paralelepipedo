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

module.exports = router;
