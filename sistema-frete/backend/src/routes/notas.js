// Notas fiscais (embarcador; regras em src/notasFiscais.js e src/danfe.js): consulta, XML, .zip e DANFE.
const express = require('express');
const fs = require('fs');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const nf = require('../notasFiscais');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[notas]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };

router.get('/', autenticar, async (req, res) => {
  try { res.json(await nf.listar(req, req.query)); } catch (err) { erro(res, err, 'Erro ao listar as notas.'); }
});
router.get('/zip', autenticar, async (req, res) => {
  try {
    const z = await nf.zipDasNotas(req, req.query);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'notas_zip', detalhes: `Baixou ${z.quantidade} XML de NF-e em .zip` });
    res.download(z.arquivo, `notas-fiscais-${new Date().toISOString().slice(0, 10)}.zip`, () => fs.rm(z.arquivo, { force: true }, () => {}));
  } catch (err) { erro(res, err, 'Erro ao montar o .zip.'); }
});
router.get('/:id(\\d+)/xml', autenticar, async (req, res) => {
  try {
    const x = await nf.xmlDaNota(req, Number(req.params.id));
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${x.nome}"`);
    res.send(x.xml);
  } catch (err) { erro(res, err, 'Erro ao buscar o XML.'); }
});
router.get('/:id(\\d+)/danfe', autenticar, async (req, res) => {
  try {
    const x = await nf.xmlDaNota(req, Number(req.params.id));
    res.set('Content-Type', 'text/html; charset=utf-8');
    // O DANFE é gerado por nós a partir do XML (texto escapado); sem scripts de terceiros.
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'");
    res.send(require('../danfe').danfeHtml(x.xml));
  } catch (err) { erro(res, err, 'Erro ao montar o DANFE.'); }
});

module.exports = router;
