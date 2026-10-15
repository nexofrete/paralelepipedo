// DANFSe: representação impressa da NFS-e (gerada aqui, a partir dos dados da
// nota e do XML devolvido pelo Sistema Nacional).
const { lerNfse } = require('./montarNfse');

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const docFmt = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const dia = (v) => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; };

function danfseHtml(n, e) {
  const d = n.dados || {}; const t = d.tomador || {}; const en = t.end || {}; const s = d.servico || {}; const v = d.valores || {};
  const x = n.xml_nfse ? lerNfse(n.xml_nfse) : {};
  const desconto = Number(v.descontoIncond || 0);
  const bc = x.vBC ?? Number(n.valor);
  const marca = n.status === 'cancelada' ? 'CANCELADA' : n.demonstracao ? 'DEMONSTRAÇÃO — SEM VALOR FISCAL' : Number(n.ambiente) !== 1 ? 'HOMOLOGAÇÃO — SEM VALOR FISCAL' : '';
  const quadro = (rotulo, valor, extra = '') => `<div class="q" ${extra}><span>${rotulo}</span><b>${valor}</b></div>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFSe ${esc(n.numero_nfse || '')}</title>
<style>
  @page { size: A4; margin: 10mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 14px; font-size: 11px; }
  .pg { max-width: 190mm; margin: 0 auto; position: relative; } .acoes { text-align: center; margin-bottom: 10px; } @media print { .acoes { display: none; } body { padding: 0; } }
  .cab { display: flex; border: 1px solid #000; } .cab > div { padding: 6px 8px; } .cab .t { flex: 1; text-align: center; border-left: 1px solid #000; border-right: 1px solid #000; }
  .cab h1 { font-size: 15px; margin: 2px 0; } .cab .n { min-width: 46mm; }
  h2 { font-size: 10.5px; background: #e9ecef; border: 1px solid #000; border-top: 0; margin: 0; padding: 3px 6px; text-transform: uppercase; }
  .g { display: grid; border: 1px solid #000; border-top: 0; } .q { padding: 3px 6px; border-right: 1px solid #ccc; } .q span { display: block; font-size: 8.5px; color: #444; text-transform: uppercase; } .q b { font-size: 11px; font-weight: 600; }
  .desc { border: 1px solid #000; border-top: 0; padding: 6px; white-space: pre-wrap; min-height: 22mm; }
  .chave { font-family: monospace; font-size: 12px; letter-spacing: .5px; }
  .marca { position: absolute; top: 95mm; left: 0; right: 0; text-align: center; font-size: 34px; color: rgba(200,0,0,.18); transform: rotate(-18deg); font-weight: bold; pointer-events: none; }
  .tot b { font-size: 13px; }
</style></head><body><div class="pg">
<div class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
${marca ? `<div class="marca">${esc(marca)}</div>` : ''}
<div class="cab">
  <div style="width:46mm;">${e.logo ? `<img src="${esc(e.logo)}" alt="" style="max-width:42mm; max-height:16mm;">` : `<b>${esc(e.nome_fantasia || e.razao_social || '')}</b>`}</div>
  <div class="t"><h1>DANFSe</h1>Documento Auxiliar da Nota Fiscal de Serviço Eletrônica<br>NFS-e Padrão Nacional${x.localEmissao ? ` · ${esc(x.localEmissao)}` : ''}</div>
  <div class="n">Número da NFS-e<br><b style="font-size:15px;">${esc(n.numero_nfse || '—')}</b><br>Emitida em ${esc(dataHora(n.autorizada_em))}<br>DPS ${esc(n.serie || '')}/${esc(n.numero_dps || '')}</div>
</div>
<h2>Chave de acesso</h2>
<div class="g" style="grid-template-columns:1fr;"><div class="q"><b class="chave">${esc(String(n.chave || '').replace(/(\d{4})(?=\d)/g, '$1 '))}</b>
  <span style="margin-top:2px;">Consulte a autenticidade no Portal Nacional da NFS-e (www.nfse.gov.br), opção consulta pública, pela chave de acesso.</span></div></div>
<h2>Prestador do serviço</h2>
<div class="g" style="grid-template-columns:2fr 1fr 1fr;">
  ${quadro('Nome / razão social', esc(e.razao_social || ''))}${quadro('CNPJ', esc(docFmt(e.cnpj)))}${quadro('Inscrição municipal', esc(e.inscricao_municipal || '—'))}
  ${quadro('Endereço', esc([e.endereco, e.numero, e.complemento, e.bairro].filter(Boolean).join(', ')), 'style="grid-column:span 2;"')}${quadro('Município', `${esc(e.municipio || '')}/${esc(e.uf || '')}`)}
</div>
<h2>Tomador do serviço</h2>
<div class="g" style="grid-template-columns:2fr 1fr 1fr;">
  ${quadro('Nome / razão social', esc(t.nome || ''))}${quadro('CNPJ/CPF', esc(docFmt(t.doc)))}${quadro('E-mail', esc(t.email || '—'))}
  ${quadro('Endereço', esc([en.xLgr, en.nro, en.xCpl, en.xBairro].filter(Boolean).join(', ') || '—'), 'style="grid-column:span 2;"')}${quadro('Município', esc([en.xMun, en.uf].filter(Boolean).join('/') || '—'))}
</div>
<h2>Serviço prestado</h2>
<div class="g" style="grid-template-columns:1fr 1fr 1fr;">
  ${quadro('Código de tributação nacional', esc(`${s.cTribNac || '160201'} — transporte de natureza municipal`))}${quadro('Local da prestação', esc(x.localIncidencia || e.municipio || ''))}${quadro('Competência', esc(dia(d.competencia)))}
</div>
<div class="desc">${esc(s.descricao || '')}${s.informacoes ? `\n\n${esc(s.informacoes)}` : ''}${s.docRef ? `\nDocumento de referência: ${esc(s.docRef)}` : ''}</div>
<h2>Valores e ISS</h2>
<div class="g tot" style="grid-template-columns:repeat(4, 1fr);">
  ${quadro('Valor do serviço', moeda(v.vServ))}${quadro('Desconto incondicional', moeda(desconto))}${quadro('Base de cálculo', moeda(bc))}${quadro('Alíquota ISS', n.iss_aliquota != null ? `${Number(n.iss_aliquota).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%` : '—')}
  ${quadro('Valor do ISS', n.iss_valor != null ? moeda(n.iss_valor) : '—')}${quadro('ISS retido pelo tomador', n.iss_retido ? 'Sim' : 'Não')}${quadro('Retenções', moeda(x.vTotalRet || (n.iss_retido ? n.iss_valor : 0)))}${quadro('Valor líquido', moeda(n.valor_liquido))}
</div>
${n.status === 'cancelada' ? `<h2>Cancelamento</h2><div class="desc" style="min-height:0;">Cancelada em ${esc(dataHora(n.cancelada_em))}. ${esc(n.motivo || '')}</div>` : ''}
</div></body></html>`;
}

module.exports = { danfseHtml };
