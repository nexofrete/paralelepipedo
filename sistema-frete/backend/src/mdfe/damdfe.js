// DAMDFE (Documento Auxiliar do MDF-e) em HTML para imprimir em A4 e ir
// junto com o motorista: chave e código de barras, QR Code, veículo,
// condutores, percurso, totais e a lista dos CT-e/NF-e por descarregamento.
const QRCode = require('qrcode');
const { code128Svg } = require('../cte/codigoBarras');
const { QRCODE, TIPOS_RODADO, TIPOS_CARROCERIA, TIPOS_CARGA } = require('./montarMdfe');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, c = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
const docFmt = (v) => {
  const d = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};
const chaveFmt = (c) => String(c || '').replace(/(.{4})/g, '$1 ').trim();
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const campo = (r, v, estilo = '') => `<div class="c" style="${estilo}"><span class="r">${esc(r)}</span><span class="v">${v ?? ''}</span></div>`;

// d: dados completos (emissaoMdfe.dadosParaXml); reg: linha de mdfes.
async function gerarDamdfe(d, reg) {
  const em = d.emitente; const e = em.endereco || {};
  const autorizado = ['autorizado', 'encerrado', 'cancelado'].includes(reg.status);
  const qr = reg.chave ? await QRCode.toString(`${QRCODE}?chMDFe=${reg.chave}&tpAmb=${reg.ambiente}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : '';
  const tarja = reg.status === 'cancelado' ? 'CANCELADO' : !autorizado ? 'SEM VALOR FISCAL — NÃO AUTORIZADO'
    : reg.demonstracao ? 'DEMONSTRAÇÃO — NÃO ENVIADO À SEFAZ' : Number(reg.ambiente) === 2 ? 'SEM VALOR FISCAL — HOMOLOGAÇÃO' : '';
  const dhEmi = /<dhEmi>([^<]+)<\/dhEmi>/.exec(reg.xml_autorizado || reg.xml_assinado || '')?.[1] || reg.criado_em;
  const v = d.veiculo || {};
  const qCTe = (d.descargas || []).reduce((s, x) => s + (x.ctes || []).length, 0);
  const qNFe = (d.descargas || []).reduce((s, x) => s + (x.nfes || []).length, 0);
  const condutores = (d.condutores || []);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DAMDFE ${esc(reg.numero || 'rascunho')}</title>
<style>
  @page { size: A4; margin: 8mm; } * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; margin: 0; background: #fff; }
  .pagina { width: 194mm; margin: 0 auto; position: relative; }
  .linha { display: flex; border: 1px solid #000; margin-top: -1px; }
  .linha > .c { flex: 1; border-left: 1px solid #000; padding: 2px 4px; min-height: 22px; } .linha > .c:first-child { border-left: 0; }
  .r { display: block; font-size: 7px; text-transform: uppercase; color: #333; } .v { display: block; font-size: 10px; font-weight: bold; word-break: break-word; }
  .bloco { border: 1px solid #000; margin-top: -1px; padding: 3px 4px; }
  .tit { font-size: 7.5px; font-weight: bold; text-transform: uppercase; background: #eee; margin: -3px -4px 3px; padding: 2px 4px; border-bottom: 1px solid #000; }
  .cab { display: flex; border: 1px solid #000; } .cab > div { padding: 4px; }
  .emit { flex: 1.4; border-right: 1px solid #000; } .emit .nome { font-size: 12px; font-weight: bold; }
  .titulo { flex: 1; text-align: center; border-right: 1px solid #000; } .titulo h1 { font-size: 18px; margin: 2px 0; }
  .qr { width: 30mm; display: flex; align-items: center; justify-content: center; } .qr svg { width: 27mm; height: 27mm; }
  table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #000; padding: 2px 4px; text-align: left; font-size: 8.5px; }
  th { font-size: 7px; text-transform: uppercase; background: #f3f3f3; }
  .tarja { position: absolute; top: 110mm; left: 0; right: 0; text-align: center; font-size: 34px; font-weight: bold; color: rgba(200,0,0,0.22); transform: rotate(-28deg); pointer-events: none; }
  .acoes { text-align: center; margin: 10px; } .acoes button { font-size: 14px; padding: 8px 18px; cursor: pointer; }
  @media print { .acoes { display: none; } }
</style></head><body>
<div class="acoes"><button onclick="window.print()">Imprimir DAMDFE</button></div>
<div class="pagina">
  ${tarja ? `<div class="tarja">${esc(tarja)}</div>` : ''}
  ${reg.status === 'encerrado' ? '<div class="tarja" style="top:150mm; color:rgba(0,0,0,0.12);">ENCERRADO</div>' : ''}
  <div class="cab">
    <div class="emit"><div class="nome">${esc(em.xNome)}</div>
      <div>${esc([e.xLgr, e.nro, e.xCpl].filter(Boolean).join(', '))} — ${esc(e.xBairro)}</div>
      <div>${esc(e.xMun)} / ${esc(e.UF)} ${e.CEP ? `— CEP ${esc(e.CEP)}` : ''}</div>
      <div>CNPJ: ${esc(docFmt(em.cnpj))} &nbsp; IE: ${esc(em.ie || '')} &nbsp; RNTRC: ${esc(em.rntrc || '')}</div></div>
    <div class="titulo"><h1>DAMDFE</h1><div>Documento Auxiliar de Manifesto<br>Eletrônico de Documentos Fiscais</div><div style="margin-top:4px;"><b>MODAL RODOVIÁRIO DE CARGA</b></div></div>
    <div class="qr">${qr}</div>
  </div>
  <div class="bloco">${reg.chave ? code128Svg(reg.chave, { altura: 42 }) : '<div style="height:42px"></div>'}
    <span class="r">Chave de acesso</span><span class="v">${esc(chaveFmt(reg.chave)) || '— (gerada ao transmitir)'}</span>
    <span class="r">Consulte em https://dfe-portal.svrs.rs.gov.br/MDFE/Consulta ou pelo QR Code</span></div>
  <div class="linha">${campo('Modelo', '58')}${campo('Série', esc(reg.serie ?? ''))}${campo('Número', esc(reg.numero ?? ''))}${campo('Folha', '1/1')}
    ${campo('Data e hora de emissão', esc(dataHora(dhEmi)), 'flex:2')}${campo('UF carreg.', esc(d.ufIni))}${campo('UF descarreg.', esc(d.ufFim))}</div>
  <div class="linha">${campo('Protocolo de autorização', esc(reg.protocolo ? `${reg.protocolo} — ${dataHora(reg.autorizado_em)}` : ''), 'flex:2')}
    ${campo('Percurso', esc([d.ufIni, ...(d.percurso || []), d.ufFim].filter(Boolean).join(' → ')), 'flex:2')}</div>
  <div class="linha">${campo('Qtd. CT-e', qCTe || '')}${campo('Qtd. NF-e', qNFe || '')}${campo('Peso total (' + (String(d.tot?.cUnid) === '02' ? 'TON' : 'KG') + ')', num(d.tot?.qCarga, 3))}
    ${campo('Valor total da carga', num(d.tot?.vCarga))}${campo('Produto predominante', esc(`${d.prodPred?.xProd || ''} (${TIPOS_CARGA[d.prodPred?.tpCarga] || 'Carga geral'})`), 'flex:2')}</div>
  <div class="bloco"><div class="tit">Modal rodoviário de carga</div>
    <table><tr><th>Placa</th><th>RENAVAM</th><th>Tara (kg)</th><th>Capacidade (kg)</th><th>Rodado / carroceria</th><th>UF</th><th>RNTRC</th></tr>
      <tr><td><b>${esc(v.placa)}</b> (tração)</td><td>${esc(v.renavam || '')}</td><td>${num(v.tara, 0)}</td><td>${num(v.capKG, 0)}</td><td>${esc(`${TIPOS_RODADO[v.tpRod] || ''} / ${TIPOS_CARROCERIA[v.tpCar] || ''}`)}</td><td>${esc(v.uf || '')}</td><td>${esc(v.prop?.rntrc || em.rntrc || '')}</td></tr>
      ${(d.reboques || []).map((r) => `<tr><td><b>${esc(r.placa)}</b> (reboque)</td><td>${esc(r.renavam || '')}</td><td>${num(r.tara, 0)}</td><td>${num(r.capKG, 0)}</td><td>${esc(TIPOS_CARROCERIA[r.tpCar] || '')}</td><td>${esc(r.uf || '')}</td><td>${esc(r.prop?.rntrc || em.rntrc || '')}</td></tr>`).join('')}</table>
    <table style="margin-top:3px;"><tr><th>Condutor</th><th>CPF</th></tr>${condutores.map((c) => `<tr><td>${esc(c.xNome)}</td><td>${esc(docFmt(c.cpf))}</td></tr>`).join('')}</table>
    ${(d.valePedagio || []).length || (d.ciot || []).length ? `<table style="margin-top:3px;"><tr><th>CIOT</th><th>Vale-pedágio: fornecedora</th><th>Comprovante</th><th>Valor</th></tr>
      ${Array.from({ length: Math.max((d.ciot || []).length, (d.valePedagio || []).length) }, (_, i) => `<tr><td>${esc(d.ciot?.[i]?.ciot || '')}</td><td>${esc(docFmt(d.valePedagio?.[i]?.cnpjForn))}</td><td>${esc(d.valePedagio?.[i]?.nCompra || '')}</td><td>${num(d.valePedagio?.[i]?.vValePed)}</td></tr>`).join('')}</table>` : ''}
    ${(d.seguros || []).filter((s) => s.nApol || s.xSeg).map((s) => `<div style="margin-top:3px;">Seguro: <b>${esc(s.xSeg || '')}</b> ${s.cnpjSeg ? `(${esc(docFmt(s.cnpjSeg))})` : ''} · apólice ${esc(s.nApol || '')} ${(s.nAver || []).length ? `· averbação ${esc(s.nAver.join(', '))}` : ''}</div>`).join('')}
  </div>
  <div class="bloco"><div class="tit">Carregamento: ${esc((d.carregamento || []).map((x) => x.xMun).join(', '))} / ${esc(d.ufIni)}</div>
    <table><tr><th>Descarregamento</th><th>Documento</th><th>Chave de acesso</th></tr>
      ${(d.descargas || []).map((x) => [...(x.ctes || []).map((c) => ['CT-e', c]), ...(x.nfes || []).map((c) => ['NF-e', c])]
    .map(([tipo, c], i) => `<tr><td>${i === 0 ? `<b>${esc(x.xMun)}</b>` : ''}</td><td>${tipo} ${Number(String(c).slice(25, 34)) || ''}</td><td>${esc(chaveFmt(c))}</td></tr>`).join('')).join('')}</table></div>
  ${(d.lacres || []).length ? `<div class="bloco"><div class="tit">Lacres</div>${esc(d.lacres.join(', '))}</div>` : ''}
  <div class="bloco" style="min-height:40px;"><div class="tit">Observações</div>${esc(d.infCpl || '')}</div>
  <div class="linha">${campo('Reservado ao fisco', '', 'flex:1;min-height:40px')}</div>
</div></body></html>`;
}

module.exports = { gerarDamdfe };
