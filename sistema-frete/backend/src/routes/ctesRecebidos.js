// CT-e recebidos (embarcador; regras em src/ctesRecebidos.js): consulta, XML, .zip, DACTE e eventos.
const express = require('express');
const fs = require('fs');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const c = require('../ctesRecebidos');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[ctes]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const enviarXml = (res, x) => { res.set('Content-Type', 'application/xml; charset=utf-8'); res.set('Content-Disposition', `attachment; filename="${x.nome}"`); res.send(x.xml); };

router.get('/', autenticar, async (req, res) => {
  try { res.json(await c.listar(req, req.query)); } catch (err) { erro(res, err, 'Erro ao listar os CT-e.'); }
});
router.get('/zip', autenticar, async (req, res) => {
  try {
    const z = await c.zipDosCtes(req, req.query);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'ctes_zip', detalhes: `Baixou ${z.quantidade} XML de CT-e${z.eventos ? ` e ${z.eventos} de eventos` : ''} em .zip` });
    res.download(z.arquivo, `ctes-${new Date().toISOString().slice(0, 10)}.zip`, () => fs.rm(z.arquivo, { force: true }, () => {}));
  } catch (err) { erro(res, err, 'Erro ao montar o .zip.'); }
});
router.get('/:id(\\d+)/xml', autenticar, async (req, res) => {
  try { enviarXml(res, await c.xmlDoCte(req, Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao buscar o XML.'); }
});
router.get('/:id(\\d+)/dacte', autenticar, async (req, res) => {
  try {
    const html = await c.dacte(req, Number(req.params.id));
    // O DACTE é gerado por nós a partir do XML (texto escapado); só o botão de imprimir tem script.
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'");
    res.send(html);
  } catch (err) { erro(res, err, 'Erro ao montar o DACTE.'); }
});
router.get('/:id(\\d+)/eventos', autenticar, async (req, res) => {
  try { res.json(await c.eventosDoFrete(req, Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao listar os eventos.'); }
});
router.get('/:id(\\d+)/eventos/:ev(\\d+)/xml', autenticar, async (req, res) => {
  try { enviarXml(res, await c.xmlDoEvento(req, Number(req.params.id), Number(req.params.ev))); } catch (err) { erro(res, err, 'Erro ao buscar o XML do evento.'); }
});

module.exports = router;
