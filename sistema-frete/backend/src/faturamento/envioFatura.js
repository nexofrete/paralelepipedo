// E-mail da fatura para o cliente: a fatura no corpo (QR do PIX embutido),
// a linha digitável do boleto e os anexos. Usado pelo botão "Enviar por e-mail"
// e pela régua de cobrança (que põe uma mensagem antes da fatura).
const pool = require('../db');
const cobranca = require('../boleto/cobranca');
const { fichaHtml } = require('../boleto/ficha');
const { gerarFaturaHtml, cobrancaPix } = require('./faturaHtml');

const empresa = async () => (await pool.query('SELECT * FROM empresa WHERE id = 1')).rows[0] || {};
const isoDe = (v) => String(v instanceof Date ? v.toISOString() : v || '').slice(0, 10);
const diaBr = (v) => isoDe(v).split('-').reverse().join('/');

// Boleto de valor maior que o saldo (a fatura recebeu um pagamento parcial depois de gerado):
// não vai junto, para o cliente não pagar a mais. O PIX já sai com o saldo.
function boletoValeOSaldo(f) {
  const saldo = f.saldo != null ? Number(f.saldo) : Number(f.valor_bruto || 0) - Number(f.desconto || 0) - Number(f.valor_pago || 0);
  return !(f.boleto_valor != null && Number(f.boleto_valor) > saldo + 0.01);
}

// Boleto da fatura (ficha de compensação) para pôr junto da fatura impressa.
async function boletoDaFatura(f, e) {
  if (!f.boleto_codigo || !cobranca.ATIVO.includes(f.boleto_status) || !['aberta', 'parcial'].includes(f.status)) return '';
  if (!boletoValeOSaldo(f)) return '';
  return fichaHtml(f, e, e.boleto_config || {}, await cobranca.pagador(f));
}
const comBoleto = (html, boleto) => (boleto ? html.replace('</body>', `<div style="page-break-before:always;"></div>${boleto}</body>`) : html);

// mensagem: { titulo, paragrafos[] } mostrada acima da fatura (lembrete/cobrança).
async function enviarFaturaEmail(f, { para, copia, assunto, mensagem } = {}) {
  const e = await empresa();
  const pix = await cobrancaPix(f, e).catch(() => null);
  const boleto = await boletoDaFatura(f, e);
  const anexos = [{ filename: `fatura-${f.numero}.html`, content: comBoleto(await gerarFaturaHtml(f, e, { pix }), boleto) }];
  if (pix) anexos.push({ filename: 'pix.png', content: pix.qrPng.split(',')[1], encoding: 'base64', cid: 'qrpix' });
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const topo = mensagem ? `<div style="font-family:Arial,sans-serif; max-width:186mm; margin:0 auto 14px; font-size:14px; line-height:1.55; color:#1f2937;">
      ${mensagem.titulo ? `<p style="font-size:16px; font-weight:bold; margin:0 0 8px;">${esc(mensagem.titulo)}</p>` : ''}
      ${(mensagem.paragrafos || []).map((p) => `<p style="margin:0 0 8px;">${esc(p)}</p>`).join('')}</div>` : '';
  const linha = boleto ? `<div style="font-family:Arial; border:1px solid #1F4E78; border-radius:8px; padding:10px 12px; margin:14px auto; max-width:186mm;">
      <b>Boleto</b> (vencimento ${diaBr(f.boleto_vencimento)}) — linha digitável:<br>
      <span style="font-family:monospace; font-size:14px;">${require('../boleto/boleto').formatarLinha(f.boleto_linha)}</span><br><small>O boleto para imprimir está no arquivo anexo.</small></div>` : '';
  let html = comBoleto(await gerarFaturaHtml(f, e, { paraEmail: true, pix }), linha);
  if (topo) html = html.replace(/<body([^>]*)>/i, (m) => `${m}${topo}`);
  await require('../email').enviarFatura({
    destinatarioEmail: para, copia, assunto: assunto || `Fatura ${f.numero} — ${e.razao_social} — vencimento ${diaBr(f.vencimento)}`, html, anexos,
  });
  await pool.query('UPDATE faturas_transporte SET enviada_em = COALESCE(enviada_em, NOW()), tomador_email = COALESCE(tomador_email, $2) WHERE id = $1', [f.id, String(para).split(/[;,]/)[0].trim()]);
  return { pix: pix?.copiaECola || pix?.brCode || null, linha: f.boleto_linha || null };
}

module.exports = { boletoValeOSaldo, boletoDaFatura, comBoleto, enviarFaturaEmail, empresa };
