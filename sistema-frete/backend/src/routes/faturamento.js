// Faturamento e contas a receber da transportadora: CT-e a faturar, faturas,
// recebimentos, impressão/e-mail com PIX, DOCCOB e o resumo do contas a receber.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const fat = require('../faturamento/faturamento');
const { gerarFaturaHtml, cobrancaPix } = require('../faturamento/faturaHtml');
const edi = require('../edi/arquivos');
const cobranca = require('../boleto/cobranca');
const { fichaHtml } = require('../boleto/ficha');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[faturamento]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const empresa = async () => (await pool.query('SELECT * FROM empresa WHERE id = 1')).rows[0] || {};
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
// Boleto da fatura (ficha de compensação) para pôr junto da fatura impressa.
async function boletoDaFatura(f, e) {
  if (!f.boleto_codigo || !cobranca.ATIVO.includes(f.boleto_status) || !['aberta', 'parcial'].includes(f.status)) return '';
  return fichaHtml(f, e, e.boleto_config || {}, await cobranca.pagador(f));
}
const comBoleto = (html, boleto) => (boleto ? html.replace('</body>', `<div style="page-break-before:always;"></div>${boleto}</body>`) : html);

// ---------------- Boleto registrado (CNAB 240) ----------------
router.get('/boleto/config', autenticar, pode, rota(async (req, res) => res.json(await cobranca.config()), 'Erro ao carregar.'));
router.put('/boleto/config', autenticar, pode, rota(async (req, res) => {
  const c = await cobranca.salvarConfig(req.body || {});
  log(req, 'fatura', `Configurou o boleto (${c.banco_nome}, agência ${c.agencia})`);
  res.json(c);
}, 'Erro ao salvar.'));
router.get('/boleto/pendentes', autenticar, pode, rota(async (req, res) => res.json(await cobranca.pendentesRemessa()), 'Erro.'));
router.post('/boleto/remessa', autenticar, pode, rota(async (req, res) => {
  const r = await cobranca.gerarRemessa(req.usuario.nome);
  log(req, 'fatura', `Gerou a remessa ${r.nome}: ${r.entradas} boleto(s) novo(s), ${r.baixas} pedido(s) de baixa`);
  res.json({ id: r.id, nome: r.nome, qtd: r.qtd, entradas: r.entradas, baixas: r.baixas, total: r.total });
}, 'Erro ao gerar a remessa.'));
router.get('/boleto/arquivos', autenticar, pode, rota(async (req, res) => {
  const { rows } = await pool.query('SELECT id, tipo, banco, nsa, nome_arquivo, qtd, valor_total, resultado, usuario_nome, criado_em FROM boleto_arquivos ORDER BY id DESC LIMIT 100');
  res.json(rows);
}, 'Erro.'));
router.get('/boleto/arquivos/:id(\\d+)/baixar', autenticar, pode, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nome_arquivo, conteudo FROM boleto_arquivos WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).send('Arquivo não encontrado.');
    res.set({ 'Content-Type': 'text/plain; charset=latin1', 'Content-Disposition': `attachment; filename="${rows[0].nome_arquivo}"` });
    return res.send(Buffer.from(rows[0].conteudo, 'latin1'));
  } catch (err) { return res.status(400).send(err.message); }
});
// Retorno do banco: { nome, conteudo } (o texto do arquivo .ret).
router.post('/boleto/retorno', autenticar, pode, rota(async (req, res) => {
  const r = await cobranca.processarRetorno(String(req.body?.conteudo || ''), { nomeArquivo: req.body?.nome, usuarioNome: req.usuario.nome });
  log(req, 'fatura', `Processou o retorno do banco ${req.body?.nome || ''}: ${r.titulos} título(s), ${r.pagos} pago(s), R$ ${r.valorPago.toFixed(2)}`);
  res.json(r);
}, 'Erro ao ler o retorno.'));
router.post('/:id(\\d+)/boleto', autenticar, pode, rota(async (req, res) => {
  const f = await cobranca.gerar(Number(req.params.id));
  log(req, 'fatura', `Gerou o boleto da fatura ${f.numero} (nosso número ${f.boleto_nn_exibir})`);
  res.json(f);
}, 'Erro ao gerar o boleto.'));
router.get('/:id(\\d+)/boleto', autenticar, pode, async (req, res) => {
  try {
    const f = await fat.carregar(req.params.id);
    const e = await empresa();
    const b = f ? await boletoDaFatura(f, e) : '';
    if (!b) return res.status(404).send('Esta fatura não tem boleto valendo.');
    return res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boleto — fatura ${f.numero}</title>
      <style>@page { size: A4; margin: 10mm; } body { margin: 0; } .acoes { text-align: center; margin: 10px; } @media print { .acoes { display: none; } }</style></head>
      <body><div class="acoes"><button onclick="window.print()">Imprimir boleto</button></div>${b}</body></html>`);
  } catch (err) { return res.status(400).send(String(err.message).replace(/</g, '&lt;')); }
});

router.get('/a-faturar', autenticar, pode, rota(async (req, res) => res.json(await fat.pendentesPorTomador(req.query)), 'Erro ao listar os CT-e a faturar.'));
router.get('/resumo', autenticar, pode, rota(async (req, res) => res.json(await fat.resumo()), 'Erro ao montar o resumo.'));
router.get('/', autenticar, pode, rota(async (req, res) => res.json(await fat.listar(req.query)), 'Erro ao listar as faturas.'));
router.get('/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const f = await fat.carregar(req.params.id);
  if (!f) return res.status(404).json({ erro: 'Fatura não encontrada.' });
  const e = await empresa();
  const pix = await cobrancaPix(f, e).catch(() => null);
  return res.json({ ...f, pix: pix?.copiaECola || null });
}, 'Erro ao abrir a fatura.'));

router.post('/', autenticar, pode, rota(async (req, res) => {
  const f = await fat.criar({ ...req.body, usuarioNome: req.usuario.nome });
  log(req, 'fatura', `Emitiu a fatura ${f.numero} de ${f.tomador_nome} (${f.itens.length} documento(s), R$ ${Number(f.valor_liquido).toFixed(2)})`);
  res.status(201).json(f);
}, 'Erro ao criar a fatura.'));
router.post('/periodo', autenticar, pode, rota(async (req, res) => {
  const criadas = await fat.faturarPeriodo({ ...req.body, usuarioNome: req.usuario.nome });
  log(req, 'fatura', `Faturou o período: ${criadas.length} fatura(s) (${criadas.map((f) => f.numero).join(', ')})`);
  res.status(201).json(criadas.map((f) => ({ id: f.id, numero: f.numero, tomador: f.tomador_nome, valor: f.valor_liquido, ctes: f.itens.length })));
}, 'Erro ao faturar o período.'));

router.post('/:id(\\d+)/receber', autenticar, pode, rota(async (req, res) => {
  const f = await fat.receber(req.params.id, { ...req.body, usuarioNome: req.usuario.nome });
  // Pago por fora (PIX, depósito) com boleto no banco: pede a baixa do boleto.
  if (f.status === 'paga' && req.body?.forma !== 'boleto') await cobranca.pedirBaixa(f.id);
  log(req, 'fatura', `Recebimento na fatura ${f.numero}: R$ ${Number(req.body?.valor ?? 0).toFixed(2)} (${req.body?.forma || 'pix'}) — ${f.status}`);
  res.json(f);
}, 'Erro ao registrar o recebimento.'));
router.delete('/:id(\\d+)/pagamentos/:pid(\\d+)', autenticar, pode, rota(async (req, res) => {
  const f = await fat.estornar(req.params.id, req.params.pid);
  log(req, 'fatura', `Estornou um recebimento da fatura ${f.numero}`);
  res.json(f);
}, 'Erro ao estornar.'));
router.post('/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  const f = await fat.cancelar(req.params.id, req.body?.motivo);
  await cobranca.pedirBaixa(f.id);
  log(req, 'fatura', `Cancelou a fatura ${f.numero}: ${req.body?.motivo || ''}`);
  res.json(f);
}, 'Erro ao cancelar a fatura.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const f = await fat.carregar(req.params.id);
  if (!f) return res.status(404).json({ erro: 'Fatura não encontrada.' });
  if (!['aberta', 'parcial'].includes(f.status)) return res.status(409).json({ erro: `Fatura ${f.status} não pode ser alterada.` });
  const venc = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.vencimento || '') ? req.body.vencimento : null;
  const mudouVenc = venc && venc !== String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10);
  if (mudouVenc && ['remetido', 'registrado'].includes(f.boleto_status)) {
    return res.status(409).json({ erro: 'O boleto desta fatura já foi para o banco. Para prorrogar, peça a baixa do boleto (cancele e refature) ou combine a prorrogação direto no banco.' });
  }
  // Boleto ainda não enviado: é descartado e gera-se outro com o vencimento novo.
  if (mudouVenc && f.boleto_status === 'gerado') await pool.query(`UPDATE faturas_transporte SET boleto_status = 'baixado', boleto_mensagem = 'Descartado: vencimento alterado antes da remessa' WHERE id = $1`, [f.id]);
  const email = String(req.body?.tomador_email ?? f.tomador_email ?? '').trim().slice(0, 160) || null;
  await pool.query('UPDATE faturas_transporte SET vencimento = COALESCE($2, vencimento), tomador_email = $3, observacoes = COALESCE($4, observacoes) WHERE id = $1',
    [f.id, venc, email, req.body?.observacoes ?? null]);
  if (venc && venc !== String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10)) log(req, 'fatura', `Prorrogou a fatura ${f.numero} para ${venc}`);
  return res.json(await fat.carregar(f.id));
}, 'Erro ao salvar a fatura.'));

// Impressão (HTML A4) — abre em nova aba com ?token=.
router.get('/:id(\\d+)/imprimir', autenticar, pode, async (req, res) => {
  try {
    const f = await fat.carregar(req.params.id);
    if (!f) return res.status(404).send('Fatura não encontrada.');
    const e = await empresa();
    res.set('Content-Type', 'text/html; charset=utf-8').send(comBoleto(await gerarFaturaHtml(f, e), await boletoDaFatura(f, e)));
  } catch (err) { res.status(400).send(`Não consegui gerar a fatura: ${String(err.message).replace(/</g, '&lt;')}`); }
});

// E-mail para o cliente: fatura no corpo (QR do PIX embutido) e anexada.
router.post('/:id(\\d+)/email', autenticar, pode, rota(async (req, res) => {
  const f = await fat.carregar(req.params.id);
  if (!f) return res.status(404).json({ erro: 'Fatura não encontrada.' });
  const para = String(req.body?.para || f.tomador_email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para.split(/[;,]/)[0] || '')) return res.status(400).json({ erro: 'Informe o e-mail do cliente.' });
  if (f.status === 'cancelada') return res.status(409).json({ erro: 'Fatura cancelada não é enviada.' });
  const e = await empresa();
  const pix = await cobrancaPix(f, e).catch(() => null);
  const boleto = await boletoDaFatura(f, e);
  const anexos = [{ filename: `fatura-${f.numero}.html`, content: comBoleto(await gerarFaturaHtml(f, e, { pix }), boleto) }];
  if (pix) anexos.push({ filename: 'pix.png', content: pix.qrPng.split(',')[1], encoding: 'base64', cid: 'qrpix' });
  await require('../email').enviarFatura({
    destinatarioEmail: para, copia: req.body?.copia, assunto: `Fatura ${f.numero} — ${e.razao_social} — vencimento ${new Date(`${String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}`,
    html: comBoleto(await gerarFaturaHtml(f, e, { paraEmail: true, pix }), boleto ? `<div style="font-family:Arial; border:1px solid #1F4E78; border-radius:8px; padding:10px 12px; margin:14px auto; max-width:186mm;">
      <b>Boleto</b> (vencimento ${String(f.boleto_vencimento instanceof Date ? f.boleto_vencimento.toISOString() : f.boleto_vencimento).slice(0, 10).split('-').reverse().join('/')}) — linha digitável:<br>
      <span style="font-family:monospace; font-size:14px;">${require('../boleto/boleto').formatarLinha(f.boleto_linha)}</span><br><small>O boleto para imprimir está no arquivo anexo.</small></div>` : ''), anexos,
  });
  await pool.query('UPDATE faturas_transporte SET enviada_em = NOW(), tomador_email = COALESCE(tomador_email, $2) WHERE id = $1', [f.id, para]);
  log(req, 'fatura', `Enviou a fatura ${f.numero} por e-mail para ${para}`);
  res.json({ ok: true, para });
}, 'Erro ao enviar a fatura.'));

// DOCCOB (EDI PROCEDA 3.0A) da fatura, para o cliente que recebe cobrança por EDI.
router.get('/:id(\\d+)/doccob', autenticar, pode, async (req, res) => {
  try {
    const { conhecimentoEdi, cabecalhoTransportadora, nomeArquivo } = require('./edi').ajudantes;
    const f = await fat.carregar(req.params.id);
    if (!f) return res.status(404).send('Fatura não encontrada.');
    const { rows } = await pool.query('SELECT id, serie, numero, chave, protocolo, autorizado_em, dados, valor_total FROM ctes_emitidos WHERE fatura_id = $1 ORDER BY numero', [f.id]);
    const ctes = rows.map(conhecimentoEdi);
    const e = await empresa();
    const texto = edi.montarDoccob({ ...await cabecalhoTransportadora(f.tomador_nome), cobrancas: [{
      serie: '', numero: f.numero, emissao: f.emissao, vencimento: String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10),
      valor: Number(f.valor_bruto) - Number(f.desconto), icms: ctes.reduce((s, c) => s + c.valorIcms, 0),
      banco: e.banco_codigo, agencia: String(e.banco_agencia || '').replace(/\D/g, ''), conta: String(e.banco_conta || '').replace(/\D/g, ''),
      conhecimentos: ctes.map((c) => ({ serie: c.serie, numero: c.numero, valorFrete: c.valorFrete, emissao: c.emissao, cnpjRemetente: c.cnpjRemetente,
        cnpjDestinatario: c.cnpjDestinatario, cnpjEmissor: '', notas: c.notas.map((n) => ({ ...n, cnpjEmissor: c.cnpjEmissorNf })) })),
    }] });
    res.set({ 'Content-Type': 'text/plain; charset=latin1', 'Content-Disposition': `attachment; filename="${nomeArquivo('DOCCOB', f.tomador_nome)}"` });
    res.send(Buffer.from(texto, 'latin1'));
  } catch (err) { res.status(err.status || 400).send(err.message); }
});

// Configuração da cobrança (PIX, banco, prazo, numeração, instruções).
const CAMPOS = ['pix_chave', 'pix_cidade', 'banco_nome', 'banco_codigo', 'banco_agencia', 'banco_conta', 'fatura_instrucoes', 'fatura_prazo_dias', 'fatura_proximo_numero'];
router.get('/config', autenticar, pode, rota(async (req, res) => {
  const e = await empresa();
  res.json(Object.fromEntries([...CAMPOS, 'razao_social', 'municipio'].map((c) => [c, e[c] ?? null])));
}, 'Erro ao carregar.'));
router.put('/config', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const pares = CAMPOS.filter((c) => b[c] !== undefined).map((c) => [c, ['fatura_prazo_dias', 'fatura_proximo_numero'].includes(c)
    ? Math.max(c === 'fatura_prazo_dias' ? 0 : 1, parseInt(b[c], 10) || (c === 'fatura_prazo_dias' ? 15 : 1)) : (String(b[c] ?? '').trim() || null)]);
  if (!pares.length) return res.status(400).json({ erro: 'Nada para salvar.' });
  if (b.pix_chave) require('../faturamento/pix').brCode({ chave: b.pix_chave, nome: 'TESTE', cidade: 'TESTE', valor: 1 });
  await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await pool.query(`UPDATE empresa SET ${pares.map(([c], i) => `${c} = $${i + 1}`).join(', ')} WHERE id = 1`, pares.map(([, v]) => v));
  log(req, 'fatura', 'Atualizou a configuração de cobrança (PIX/banco/faturas)');
  const e = await empresa();
  return res.json(Object.fromEntries([...CAMPOS, 'razao_social', 'municipio'].map((c) => [c, e[c] ?? null])));
}, 'Erro ao salvar.'));

router.ajudantes = { boletoDaFatura, comBoleto };
module.exports = router;
