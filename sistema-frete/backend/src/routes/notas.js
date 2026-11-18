// Notas fiscais (embarcador; regras em src/notasFiscais.js e src/danfe.js): consulta, XML, .zip e DANFE.
const express = require('express');
const fs = require('fs');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const nf = require('../notasFiscais');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[notas]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };

// Corrigir à mão o endereço de entrega ou do redespacho.
router.put('/:id(\\d+)/endereco', autenticar, require('../permissoes').permitirAlguma('pode_editar_registros'), async (req, res) => {
  try {
    const r = await nf.corrigirEndereco(req, Number(req.params.id), req.body || {});
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_registro',
      detalhes: `Corrigiu o endereço ${r.qual === 'redespacho' ? 'do redespacho' : 'de entrega'} do registro #${req.params.id}: ${require('../enderecoEntrega').textoEndereco(r.endereco)}` });
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao corrigir o endereço.'); }
});

router.get('/', autenticar, async (req, res) => {
  try { res.json(await nf.listar(req, req.query)); } catch (err) { erro(res, err, 'Erro ao listar as notas.'); }
});
// Faturamento do dia (Visão geral): ?data=AAAA-MM-DD (padrão: hoje).
// ---------- Etiquetas de volume das notas (10 × 7 cm, padrão do ERP) ----------
// ids=1,2,3 e faixas=1:1-5;2:3 (reimprimir só alguns volumes de uma nota).
const etq = require('../etiquetasNota');
const idsQ = (v) => String(v || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
// transp: JSON { id: "NOME" } com a transportadora digitada na tela.
const transpQ = (v) => { try { const o = JSON.parse(String(v || '{}')); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const faixasQ = (v) => Object.fromEntries(String(v || '').split(';').map((p) => p.split(':')).filter((p) => p.length === 2 && /^\d+$/.test(p[0])).map(([id, f]) => [id, f]));
router.get('/etiquetas', autenticar, async (req, res) => {
  try {
    const lista = await etq.etiquetasDasNotas(req, idsQ(req.query.ids), faixasQ(req.query.faixas), transpQ(req.query.transp));
    if (!lista.length) return res.status(404).send('Nenhuma nota encontrada para as etiquetas.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(etq.html(lista));
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro ao montar as etiquetas.')); }
});
router.get('/etiquetas/zpl', autenticar, async (req, res) => {
  try {
    const lista = await etq.etiquetasDasNotas(req, idsQ(req.query.ids), faixasQ(req.query.faixas), transpQ(req.query.transp));
    if (!lista.length) return res.status(404).send('Nenhuma nota encontrada para as etiquetas.');
    const c = await etq.config();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="etiquetas-notas-${Date.now()}.zpl"`);
    res.send(etq.zpl(lista, { dpi: req.query.dpi || c.dpi }));
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro ao gerar o ZPL.')); }
});
router.post('/etiquetas/zebra', autenticar, async (req, res) => {
  try {
    const b = req.body || {};
    const c = await etq.config();
    if (b.teste) {
      await etq.enviarParaZebra(etq.zpl([{ nome: 'TESTE DE IMPRESSAO NEXOFRETE', rua: 'ETIQUETA 10 X 7 CM', bairro: 'BAIRRO', cidade: 'CIDADE', uf: 'UF', cep: '00000-000', transportadora: 'TRANSPORTADORA', volume: 1, total: 1, pedido: '0', nota: '0' }], { dpi: c.dpi }), c);
      return res.json({ ok: true, mensagem: `Etiqueta de teste enviada para ${c.ip}:${c.porta}.` });
    }
    const lista = await etq.etiquetasDasNotas(req, (Array.isArray(b.ids) ? b.ids : []), b.faixas || {}, b.transps || {});
    if (!lista.length) throw Object.assign(new Error('Nenhuma nota encontrada para as etiquetas.'), { status: 404 });
    await etq.enviarParaZebra(etq.zpl(lista, { dpi: c.dpi }), c);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'etiquetas', detalhes: `Mandou ${lista.length} etiqueta(s) de volume para a Zebra ${c.ip} (NF ${[...new Set(lista.map((x) => x.nota))].join(', ')})` });
    res.json({ ok: true, mensagem: `${lista.length} etiqueta(s) enviada(s) para a Zebra (${c.ip}).` });
  } catch (err) { erro(res, err, 'Erro ao mandar para a Zebra.'); }
});
router.get('/etiquetas/config', autenticar, async (req, res) => {
  try { res.json(await etq.config()); } catch (err) { erro(res, err, 'Erro.'); }
});
router.put('/etiquetas/config', autenticar, require('../middlewareAuth').apenasAdmin, async (req, res) => {
  try { res.json(await etq.salvarConfig(req.body || {})); } catch (err) { erro(res, err, 'Erro ao salvar a impressora.'); }
});

// Notas que sumiram por terem sido escritas por cima por outra nota do mesmo pedido (corrigido na 1.73.0).
router.get('/substituidas', autenticar, async (req, res) => {
  try { res.json(await nf.notasSubstituidas(req)); } catch (err) { erro(res, err, 'Erro ao procurar as notas substituídas.'); }
});
// Conferir o faturamento do dia com a lista colada do ERP: { data, numeros }.
router.post('/conferir-dia', autenticar, async (req, res) => {
  try { res.json(await nf.conferirDia(req, req.body || {})); } catch (err) { erro(res, err, 'Erro ao conferir o dia.'); }
});
router.get('/faturamento-dia', autenticar, async (req, res) => {
  try { res.json(await nf.faturamentoDia(req, req.query)); } catch (err) { erro(res, err, 'Erro ao calcular o faturamento do dia.'); }
});
router.get('/zip', autenticar, async (req, res) => {
  try {
    const z = await nf.zipDasNotas(req, req.query);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'notas_zip', detalhes: `Baixou ${z.quantidade} XML de NF-e em .zip` });
    res.download(z.arquivo, `notas-fiscais-${new Date().toISOString().slice(0, 10)}.zip`, () => fs.rm(z.arquivo, { force: true }, () => {}));
  } catch (err) { erro(res, err, 'Erro ao montar o .zip.'); }
});
const CSP_DANFE = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'";
router.get('/danfes', autenticar, async (req, res) => {
  try {
    const d = await nf.danfesEmLote(req, req.query);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'notas_danfe_lote', detalhes: `Abriu ${d.quantidade} DANFE para imprimir` });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Security-Policy', CSP_DANFE);
    res.send(d.html);
  } catch (err) {
    // Aberto em outra aba: o erro vira uma página simples.
    if (!err.status) console.error('[notas]', err.message);
    res.status(err.status || 500).set('Content-Type', 'text/html; charset=utf-8')
      .send(`<!doctype html><meta charset="utf-8"><p style="font:15px Arial; padding:20px;">${String(err.status ? err.message : 'Erro ao montar os DANFE.').replace(/</g, '&lt;')}</p>`);
  }
});
router.get('/:id(\\d+)/eventos', autenticar, async (req, res) => {
  try { res.json(await nf.eventosDaNota(req, Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao listar os eventos.'); }
});
router.get('/:id(\\d+)/eventos/:ev(\\d+)/xml', autenticar, async (req, res) => {
  try {
    const x = await nf.xmlDoEvento(req, Number(req.params.id), Number(req.params.ev));
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${x.nome}"`);
    res.send(x.xml);
  } catch (err) { erro(res, err, 'Erro ao buscar o XML do evento.'); }
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
    const danfe = require('../danfe');
    res.send(danfe.danfeHtml(x.xml, { marca: x.cancelada ? 'CANCELADA' : null, empresa: await danfe.empresaDanfe() }));
  } catch (err) { erro(res, err, 'Erro ao montar o DANFE.'); }
});

module.exports = router;
