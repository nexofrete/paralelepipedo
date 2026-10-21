// Fatura em HTML (A4, para imprimir ou mandar por e-mail): dados da
// transportadora e do cliente, CT-e cobrados, totais, recebimentos e a
// cobrança por PIX (QR Code + copia e cola) e/ou depósito.
const QRCode = require('qrcode');
const { brCode } = require('./pix');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (v) => (v ? new Date(`${String(v instanceof Date ? v.toISOString() : v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
// Data e hora (autorização do CT-e/NFS-e): o dia no horário de Brasília (21h30 do dia 5 é dia 5, não 6).
const diaDoMomento = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const docFmt = (v) => {
  const d = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};
const FORMAS = { pix: 'PIX', boleto: 'Boleto', deposito: 'Depósito/TED', dinheiro: 'Dinheiro', cheque: 'Cheque', outro: 'Outro' };

// Dados de cobrança da fatura (PIX copia e cola + imagem do QR em data URI), ou null sem chave PIX.
// Com a API Pix do banco ligada, é a cobrança dinâmica (baixa automática); se o banco falhar, cai no estático.
async function cobrancaPix(f, e) {
  if (!e.pix_chave || f.status === 'cancelada' || !(Number(f.saldo) > 0)) return null;
  let dinamico = null;
  try { dinamico = await require('./pixApi').cobrancaDaFatura(f, e); } catch (err) { console.error('[pix api] fatura', f.numero, err.message); }
  if (dinamico) return { copiaECola: dinamico.copiaECola, txid: dinamico.txid, dinamico: true, qrPng: await QRCode.toDataURL(dinamico.copiaECola, { margin: 1, width: 220, errorCorrectionLevel: 'M' }) };
  const copiaECola = brCode({ chave: e.pix_chave, nome: e.razao_social, cidade: e.pix_cidade || e.municipio, valor: f.saldo, txid: `FAT${f.numero}`, descricao: `Fatura ${f.numero}` });
  return { copiaECola, qrPng: await QRCode.toDataURL(copiaECola, { margin: 1, width: 220, errorCorrectionLevel: 'M' }) };
}

async function gerarFaturaHtml(f, e, { paraEmail = false, pix } = {}) {
  const cob = pix === undefined ? await cobrancaPix(f, e) : pix;
  const tarja = f.status === 'cancelada' ? 'CANCELADA' : f.status === 'paga' ? 'PAGA' : f.demonstracao ? 'DEMONSTRAÇÃO' : '';
  const qr = cob ? (paraEmail ? 'cid:qrpix' : cob.qrPng) : null;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fatura ${esc(f.numero)} — ${esc(f.tomador_nome)}</title>
<style>
  @page { size: A4; margin: 12mm; } * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; background: #fff; }
  .pagina { max-width: 186mm; margin: 0 auto; position: relative; padding: 6px; }
  .cab { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1F4E78; padding-bottom: 10px; }
  .cab h1 { margin: 0; font-size: 20px; color: #1F4E78; } .cab .num { text-align: right; } .cab .num b { font-size: 22px; }
  .caixas { display: flex; gap: 10px; margin: 12px 0; } .caixa { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
  .r { font-size: 10px; text-transform: uppercase; color: #555; display: block; } .v { font-size: 13px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; } th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; font-size: 11.5px; }
  th { background: #f1f4f8; font-size: 10px; text-transform: uppercase; } td.n, th.n { text-align: right; white-space: nowrap; }
  .totais { margin-left: auto; width: 280px; margin-top: 8px; } .totais td { border: 0; padding: 3px 6px; } .totais tr.total td { font-size: 15px; font-weight: bold; border-top: 2px solid #1F4E78; }
  .cobranca { display: flex; gap: 16px; align-items: center; border: 1px solid #1F4E78; border-radius: 8px; padding: 10px 12px; margin-top: 14px; }
  .cobranca img { width: 150px; height: 150px; } .copia { font-family: monospace; font-size: 10px; word-break: break-all; background: #f5f5f5; padding: 6px; border-radius: 4px; }
  .tarja { position: absolute; top: 90mm; left: 0; right: 0; text-align: center; font-size: 60px; font-weight: bold; color: rgba(200,0,0,0.15); transform: rotate(-24deg); pointer-events: none; }
  .acoes { text-align: center; margin: 10px; } .acoes button { font-size: 14px; padding: 8px 18px; cursor: pointer; }
  @media print { .acoes { display: none; } }
</style></head><body>
${paraEmail ? '' : '<div class="acoes"><button onclick="window.print()">Imprimir fatura</button></div>'}
<div class="pagina">
  ${tarja ? `<div class="tarja">${tarja}</div>` : ''}
  <div class="cab">
    <div><h1>${esc(e.razao_social)}</h1>
      <div>${esc([e.endereco, e.numero, e.complemento].filter(Boolean).join(', '))} — ${esc(e.bairro || '')}</div>
      <div>${esc(e.municipio || '')} / ${esc(e.uf || '')} ${e.cep ? `— CEP ${esc(e.cep)}` : ''}</div>
      <div>CNPJ ${esc(docFmt(e.cnpj))} ${e.ie ? `· IE ${esc(e.ie)}` : ''} ${e.telefone ? `· ${esc(e.telefone)}` : ''} ${e.email ? `· ${esc(e.email)}` : ''}</div></div>
    <div class="num"><span class="r">Fatura de serviços de transporte</span><b>Nº ${esc(f.numero)}</b>
      <div>Emissão ${dia(f.emissao)}</div></div>
  </div>
  <div class="caixas">
    <div class="caixa" style="flex:2;"><span class="r">Cliente (tomador do serviço)</span><span class="v">${esc(f.tomador_nome)}</span><div>CNPJ/CPF ${esc(docFmt(f.tomador_doc))}</div></div>
    <div class="caixa"><span class="r">Vencimento</span><span class="v" style="font-size:16px;">${dia(f.vencimento)}</span></div>
    <div class="caixa"><span class="r">${f.status === 'paga' ? 'Valor pago' : 'Valor a pagar'}</span><span class="v" style="font-size:16px;">${moeda(f.status === 'paga' ? f.valor_pago : f.saldo)}</span></div>
  </div>
  <table><thead><tr><th>Documento</th><th>Emissão</th><th>Notas fiscais</th><th>Remetente → destinatário</th><th>Destino</th><th class="n">Valor</th></tr></thead><tbody>
  ${f.itens.map((c) => `<tr><td>${c.tipo === 'debito' ? `Nota de débito ${esc(c.numero)}` : c.tipo === 'nfse' ? `NFS-e ${esc(c.numero)}` : `CT-e ${esc(c.serie)}/${esc(c.numero)}`}${c.tp_cte === '1' ? ' <small>(complementar)</small>' : ''}${c.iss_retido ? ' <small>(ISS retido)</small>' : ''}</td><td>${diaDoMomento(c.autorizado_em)}</td><td>${esc(c.nfs.filter(Boolean).join(', '))}</td>
    <td>${esc(c.remetente || '')}<br><small>→ ${esc(c.destinatario_nome || '')}</small></td><td>${esc(c.cidade_fim || '')}/${esc(c.uf_fim || '')}</td><td class="n">${moeda(c.valor)}</td></tr>`).join('')}
  </tbody></table>
  <table class="totais">
    <tr><td>${f.itens.length} documento(s)</td><td class="n">${moeda(f.valor_bruto)}</td></tr>
    ${Number(f.desconto) > 0 ? `<tr><td>Desconto</td><td class="n">− ${moeda(f.desconto)}</td></tr>` : ''}
    ${Number(f.valor_pago) > 0 ? `<tr><td>Já recebido</td><td class="n">− ${moeda(f.valor_pago)}</td></tr>` : ''}
    <tr class="total"><td>${f.status === 'paga' ? 'Total' : 'A pagar'}</td><td class="n">${moeda(f.status === 'paga' ? f.valor_liquido : f.saldo)}</td></tr>
  </table>
  ${cob ? `<div class="cobranca"><img src="${qr}" alt="QR Code PIX"><div style="flex:1;"><b style="font-size:14px;">Pague com PIX</b>
    <div style="margin:4px 0 6px;">Leia o QR Code no app do banco ou use o PIX copia e cola. Valor: <b>${moeda(f.saldo)}</b> · Identificação: FAT${esc(f.numero)}</div>
    <div class="copia">${esc(cob.copiaECola)}</div></div></div>` : ''}
  ${e.banco_nome || e.banco_conta ? `<div class="caixa" style="margin-top:10px;"><span class="r">Depósito / TED</span>${esc(e.banco_nome || '')} ${e.banco_codigo ? `(${esc(e.banco_codigo)})` : ''} · Agência ${esc(e.banco_agencia || '')} · Conta ${esc(e.banco_conta || '')} · Favorecido ${esc(e.razao_social)} — CNPJ ${esc(docFmt(e.cnpj))}</div>` : ''}
  ${f.pagamentos?.length ? `<div style="margin-top:10px;"><span class="r">Recebimentos</span>${f.pagamentos.map((p) => `${dia(p.data)} · ${moeda(p.valor)} · ${FORMAS[p.forma] || p.forma}`).join('<br>')}</div>` : ''}
  ${e.fatura_instrucoes || f.observacoes ? `<div style="margin-top:12px; font-size:11px; color:#333;">${esc([f.observacoes, e.fatura_instrucoes].filter(Boolean).join(' · '))}</div>` : ''}
</div></body></html>`;
}

module.exports = { gerarFaturaHtml, cobrancaPix };
