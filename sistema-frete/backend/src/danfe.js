// DANFE (Documento Auxiliar da NF-e) em HTML A4, retrato, montado do XML guardado, no layout usado pelos ERPs
// (o mesmo da DANFE da Alterdata): canhoto com destinatário e valor, quadro do emitente com o logo da empresa, quadro
// DANFE (Saída/Entrada, FL x/y, número e série), código de barras e chave, natureza e protocolo, destinatário,
// fatura, cálculo do imposto, transportador/volumes, produtos e, no rodapé de TODAS as folhas, os dados adicionais.
// Folhas A4 de altura fixa: a 1ª tem todos os quadros; as seguintes repetem o canhoto e o cabeçalho e continuam os
// produtos, com "FL x / y". O texto das informações complementares que não cabe no quadro do rodapé continua na
// última folha ("CONTINUAÇÃO - INFORMAÇÕES COMPLEMENTARES"). A divisão é feita no navegador (src/danfePaginar.js),
// medindo a altura real de cada linha, para nunca cortar uma linha de produto.
const { lerXml } = require('./notasFiscais');
const { code128Svg } = require('./cte/codigoBarras');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const n = (v, c = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
// Valor unitário: 2 casas, ou 4 quando as casas 3 e 4 não são zero (ex.: 3,8633).
const nUnit = (v) => { if (v == null || v === '') return ''; const x = Number(v); return n(x, Math.abs(Math.round(x * 100) - x * 100) > 1e-6 ? 4 : 2); };
const dig = (v) => String(v || '').replace(/\D/g, '');
const doc = (v) => {
  const d = dig(v);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};
const data = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const dataTraco = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('-') : '');
const hora = (v) => (v && String(v).length > 11 ? String(v).slice(11, 19) : '');
const cep = (v) => { const d = dig(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const fone = (v) => { const d = dig(v); return d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d; };
const MOD_FRETE = { 0: '0 - Remetente', 1: '1 - Destinatário', 2: '2 - Terceiros', 3: '3 - Próprio remetente', 4: '4 - Próprio destinatário', 9: '9 - Sem frete' };
const IND_IE = { 1: '1-Contribuinte', 2: '2-Contribuinte isento', 9: '9-Não contribuinte' };
const c = (rotulo, valor, estilo = '', cls = '') => `<div class="c ${cls}" style="${estilo}"><span class="r">${esc(rotulo)}</span><span class="v">${valor ?? ''}</span></div>`;
// Texto comprido (endereço, nome): letra menor para caber inteiro na linha, como na DANFE do ERP.
const cl = (rotulo, texto, estilo = '', limite = 40) => { const t = String(texto ?? ''); const k = t.length > limite * 1.45 ? 'pp' : t.length > limite ? 'p' : ''; return c(rotulo, esc(t), estilo, k); };

// Quebra o texto em linhas de até "largura" caracteres (fonte de largura fixa), respeitando as palavras e as quebras
// de linha do texto (inclusive o "\n" escrito como texto por alguns ERPs).
function linhasDoTexto(texto, largura) {
  const linhas = [];
  for (const par of String(texto || '').replace(/\\n/g, '\n').split(/\r?\n/)) {
    let atual = '';
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      let p = palavra;
      while (p.length > largura) { if (atual) { linhas.push(atual); atual = ''; } linhas.push(p.slice(0, largura)); p = p.slice(largura); }
      if (!atual) atual = p; else if (atual.length + 1 + p.length <= largura) atual += ` ${p}`; else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  while (linhas.length && !linhas[linhas.length - 1]) linhas.pop();
  return linhas;
}
// Largura e altura do logo (PNG ou JPEG em data URL), para escolher o arranjo do quadro do emitente.
function tamanhoImagem(dataUrl) {
  try {
    const b = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xc3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* formato desconhecido */ }
  return null;
}
const LARG_INFO = 86; const LINHAS_INFO = 9;   // quadro "Informações complementares" do rodapé (Courier 7 pt)

// Uma DANFE (uma ou mais folhas). opcoes: { marca: 'CANCELADA', empresa: { logo, cnpj } }.
function danfeFolha(xml, { marca = null, empresa = null } = {}) {
  const { inf, prot } = lerXml(xml);
  const ide = inf.ide || {}; const emit = inf.emit || {}; const ee = emit.enderEmit || {}; const dest = inf.dest || {}; const ed = dest.enderDest || {};
  const tot = inf.total?.ICMSTot || {}; const transp = inf.transp || {}; const tr = transp.transporta || {}; const vols = lista(transp.vol);
  const chave = dig(inf['@_Id']);
  const somaVol = (k) => { const v = vols.map((x) => Number(x[k])).filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const itens = lista(inf.det).map((d) => {
    const p = d.prod || {}; const imp = d.imposto || {};
    const icms = Object.values(imp.ICMS || {})[0] || {}; const ipi = imp.IPI?.IPITrib || {};
    const cst = icms.CST != null ? `${icms.orig ?? ''}${icms.CST}` : icms.CSOSN != null ? `${icms.orig ?? ''}${icms.CSOSN}` : '';
    return { cod: p.cProd, desc: [p.xProd, d.infAdProd].filter(Boolean).join(' '), ncm: p.NCM, cst, cfop: p.CFOP, un: p.uCom, qtd: p.qCom, vun: p.vUnCom, vprod: p.vProd, bc: icms.vBC, vicms: icms.vICMS, vipi: ipi.vIPI, aicms: icms.pICMS, aipi: ipi.pIPI };
  });
  const fat = inf.cobr?.fat || null; const dups = lista(inf.cobr?.dup);
  const situacao = prot && ['110', '301', '302', '303'].includes(String(prot.cStat)) ? 'USO DENEGADO' : marca;
  const id = `d${chave || ide.nNF}${Math.random().toString(36).slice(2, 7)}`;
  const logo = empresa?.logo && (!empresa.cnpj || dig(empresa.cnpj) === dig(emit.CNPJ)) ? empresa.logo : null;
  // Logo largo (mais de 1,8 vez mais largo que alto, ex.: símbolo e nome lado a lado): vai em cima, e o endereço embaixo.
  const tam = logo ? tamanhoImagem(logo) : null;
  const logoLargo = !!(tam && tam.h && tam.w / tam.h >= 1.8);

  // Canhoto (todas as folhas).
  const destEnd = [[ed.xLgr, ed.nro].filter(Boolean).join(', '), ed.xCpl, ed.xBairro, ed.xMun, ed.UF].filter(Boolean).join(' - ');
  const canhoto = `<div class="linha canhoto"><div class="c" style="flex:3.4; padding:0;">
      <div class="canh-txt">RECEBEMOS DE ${esc(String(emit.xNome || '').toUpperCase())} OS PRODUTOS/SERVIÇOS CONSTANTES NA NOTA FISCAL ELETRÔNICA INDICADA AO LADO - DESTINATÁRIO: ${esc(String(dest.xNome || '').toUpperCase())} - ${esc(String(destEnd).toUpperCase())} - EMISSÃO: ${dataTraco(ide.dhEmi || ide.dEmi)} - VALOR TOTAL: R$ ${n(tot.vNF)}</div>
      <div class="linha"><div class="c" style="flex:1; border-left:0; border-bottom:0;"><span class="r">Data de recebimento</span></div><div class="c" style="flex:2.6; border-bottom:0; border-right:0;"><span class="r">Identificação e assinatura do recebedor</span></div></div></div>
    <div class="c canh-nf"><b class="g">NF-e</b><b>Nº: ${esc(ide.nNF)}</b><b>Série: ${esc(ide.serie)}</b></div></div>
    <div class="corte"></div>`;

  // Cabeçalho (todas as folhas): emitente, quadro DANFE, código de barras e chave; natureza, protocolo; IE e CNPJ.
  const cabecalho = `<div class="linha cab">
    <div class="c emit"><b class="emit-nome">${esc(String(emit.xNome || '').toUpperCase())}</b>
      <div class="emit-corpo${logoLargo ? ' largo' : ''}">${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ''}<div class="emit-end">
        <div>${esc([ee.xLgr, ee.nro].filter(Boolean).join(', ').toUpperCase())}</div>${ee.xCpl ? `<div>${esc(String(ee.xCpl).toUpperCase())}</div>` : ''}
        <div>${esc(String(ee.xBairro || '').toUpperCase())}</div><div class="emit-mun">${esc(String(ee.xMun || '').toUpperCase())}</div>
        <div class="emit-ult"><span>${esc(ee.UF)}</span><span>${esc(fone(ee.fone))}</span><span>${cep(ee.CEP)}</span></div></div></div></div>
    <div class="c danfe-box"><b class="g2">DANFE</b><span class="mini">Documento auxiliar da Nota Fiscal Eletrônica</span>
      <div class="es"><span>Saída: 1<br>Entrada: 0</span><b class="tpnf">${String(ide.tpNF) === '0' ? '0' : '1'}</b></div>
      <b class="nfolha">FL 1 / 1</b><b>Nº: ${esc(ide.nNF)}</b><b>Série: ${esc(ide.serie)}</b></div>
    <div class="dir"><div class="c barra">${chave.length === 44 ? code128Svg(chave, { altura: 40 }) : ''}</div>
      <div class="c"><span class="r">Chave de acesso</span><span class="v chave">${esc(chave.replace(/(.{4})/g, '$1 ').trim())}</span></div>
      <div class="c consulta">Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br ou no site da Sefaz Autorizadora</div></div></div>
  <div class="linha">${c('Natureza da operação', esc(String(ide.natOp || '').toUpperCase()), 'flex:1.55')}${c('Protocolo de autorização de uso', prot ? `${esc(prot.nProt || '')} ${data(prot.dhRecbto)} ${hora(prot.dhRecbto)}${situacao ? ` — ${situacao}` : ''}` : 'sem protocolo no XML', 'flex:1; text-align:center;')}</div>
  <div class="linha">${c('Inscrição estadual', esc(emit.IE))}${c('Inscrição estadual sub. tributária', esc(emit.IEST), 'flex:1.1')}${c('CNPJ / CPF', doc(emit.CNPJ || emit.CPF), 'flex:.95')}</div>`;

  const marcaHtml = situacao ? `<div class="marca">${situacao}</div>` : '';
  const thead = `<colgroup><col style="width:17mm"><col><col style="width:14mm"><col style="width:8mm"><col style="width:8mm"><col style="width:7mm"><col style="width:13mm"><col style="width:13mm"><col style="width:15mm"><col style="width:13mm"><col style="width:11mm"><col style="width:11mm"><col style="width:9mm"><col style="width:8mm"></colgroup>
    <thead><tr><th rowspan="2">Cód. prod.</th><th rowspan="2">Descrição do produto/serviço</th><th rowspan="2">NCM/SH</th><th rowspan="2">CST</th><th rowspan="2">CFOP</th><th rowspan="2">Unid</th><th rowspan="2">Qtd.</th><th rowspan="2">Vlr.unit.</th><th rowspan="2">Vlr.total</th><th rowspan="2">BC.ICMS</th><th rowspan="2">Vlr.ICMS</th><th rowspan="2">Vlr.IPI</th><th colspan="2" class="aliq">Alíquotas</th></tr><tr><th class="aliq">ICMS</th><th class="aliq">IPI</th></tr></thead>`;

  // Rodapé (todas as folhas): dados adicionais. O que passa de 9 linhas continua na última folha.
  const info = [inf.infAdic?.infCpl].filter(Boolean).join(' ');
  const linhasInfo = linhasDoTexto(info, LARG_INFO);
  const noQuadro = linhasInfo.slice(0, LINHAS_INFO).join('\n');
  const resto = linhasInfo.slice(LINHAS_INFO).join(' ');
  const rodape = `<div class="rodape"><div class="tit">Dados adicionais</div><div class="linha">
      <div class="c info"><span class="r">Informações complementares</span><div class="mono">${esc(noQuadro)}</div></div>
      <div class="c fisco"><span class="r">Reservado ao fisco</span><div class="mono">${esc(inf.infAdic?.infAdFisco || '')}</div></div></div></div>`;
  const continuacaoInfo = resto ? `<div class="c cont-info"><span class="r2">Continuação - Informações complementares</span><div class="mono">${esc(resto)}</div></div>` : '';

  // Folha de continuação (modelo): canhoto, cabeçalho, produtos e o rodapé.
  const modelo = `<template class="danfe-cont">${marcaHtml}<div class="conteudo">${canhoto}${cabecalho}<div class="tit">Dados do produto/serviço</div><table class="itens">${thead}<tbody></tbody></table></div>${rodape}</template>`;

  const destinatario = `<div class="tit">Destinatário/remetente</div>
  <div class="linha">${cl('Nome/razão social', String(dest.xNome || '').toUpperCase(), 'flex:3.3', 48)}${c('CNPJ/CPF', doc(dest.CNPJ || dest.CPF), 'flex:1.45')}${c('Data da emissão', dataTraco(ide.dhEmi || ide.dEmi), 'flex:.85; text-align:right;')}</div>
  <div class="linha">${cl('Endereço', [ed.xLgr, ed.nro, ed.xCpl].filter(Boolean).join(', '), 'flex:2.6', 36)}${c('Bairro/distrito', esc(String(ed.xBairro || '').toUpperCase()), 'flex:1.45')}${c('CEP', cep(ed.CEP), 'flex:.75; text-align:right;')}${c('Data da entrada/saída', dataTraco(ide.dhSaiEnt || ide.dSaiEnt), 'flex:.85; text-align:right;')}</div>
  <div class="linha">${c('Município', esc(String(ed.xMun || '').toUpperCase()), 'flex:1.85')}${c('Fone/fax', esc(fone(ed.fone)), 'flex:.85')}${c('UF', esc(ed.UF), 'flex:.2')}${c('Indicador IE', esc(IND_IE[dest.indIEDest] || dest.indIEDest || ''), 'flex:.65')}${c('Inscrição estadual', esc(dest.IE), 'flex:.9')}${c('Hora da entrada/saída', esc(hora(ide.dhSaiEnt) || ide.hSaiEnt || ''), 'flex:.85; text-align:right;')}</div>
  ${inf.entrega ? `<div class="tit">Local de entrega</div><div class="linha">${c('Nome', esc(inf.entrega.xNome), 'flex:2')}${c('Endereço', esc([inf.entrega.xLgr, inf.entrega.nro, inf.entrega.xCpl, inf.entrega.xBairro].filter(Boolean).join(', ')), 'flex:3')}${c('Município / UF', `${esc(inf.entrega.xMun)}/${esc(inf.entrega.UF)}`)}</div>` : ''}`;
  const fatura = fat ? `<div class="tit">Fatura</div>
  <div class="linha">${c('Número', esc(fat.nFat), 'flex:2.4')}${c('Valor original', n(fat.vOrig), 'flex:1; text-align:right;')}${c('Valor do desconto', n(fat.vDesc ?? 0), 'flex:1; text-align:right;')}${c('Valor líquido', n(fat.vLiq), 'flex:1; text-align:right;')}</div>`
    : dups.length ? `<div class="tit">Fatura/duplicatas</div>${Array.from({ length: Math.ceil(Math.min(dups.length, 21) / 7) }, (_, k) => `<div class="linha">${dups.slice(k * 7, k * 7 + 7).map((d) => c(`Nº ${esc(d.nDup)} · venc. ${data(d.dVenc)}`, n(d.vDup))).join('')}</div>`).join('')}` : '';
  const R = 'text-align:right;';
  const imposto = `<div class="tit">Cálculo do imposto</div>
  <div class="linha">${c('Base de cálculo de ICMS', n(tot.vBC), R)}${c('Valor do ICMS', n(tot.vICMS), R)}${c('Base de cálc. de ICMS ST', n(tot.vBCST), R)}${c('Valor do ICMS ST', n(tot.vST), R)}${c('Valor total dos produtos', n(tot.vProd), `${R} flex:1.3;`)}</div>
  <div class="linha">${c('Valor do frete', n(tot.vFrete), R)}${c('Valor do seguro', n(tot.vSeg), R)}${c('Desconto', n(tot.vDesc), R)}${c('Outras desp. acessórias', n(tot.vOutro), R)}${c('Valor do IPI', n(tot.vIPI), R)}${c('Valor total da nota', n(tot.vNF), `${R} flex:1.3;`)}</div>`;
  const transportador = `<div class="tit">Transportador/volumes transportados</div>
  <div class="linha">${cl('Razão social', String(tr.xNome || '').toUpperCase(), 'flex:2.6', 36)}${c('Frete por conta', esc(MOD_FRETE[transp.modFrete] ?? transp.modFrete ?? ''), 'flex:.9')}${c('Código ANTT', esc(transp.veicTransp?.RNTC), 'flex:.85')}${c('Placa veículo', esc(transp.veicTransp?.placa), 'flex:.8')}${c('UF', esc(transp.veicTransp?.UF), 'flex:.2')}${c('CNPJ/CPF', doc(tr.CNPJ || tr.CPF), 'flex:1.15')}</div>
  <div class="linha">${cl('Endereço', String(tr.xEnder || '').toUpperCase(), 'flex:2.6', 36)}${c('Município', esc(String(tr.xMun || '').toUpperCase()), 'flex:2.55')}${c('UF', esc(tr.UF), 'flex:.2')}${c('Inscrição estadual', esc(tr.IE), 'flex:1.15')}</div>
  <div class="linha">${c('Quantidade', n(somaVol('qVol'), 0), 'flex:.8')}${c('Espécie', esc(vols.map((v) => v.esp).filter(Boolean).join(', ')), 'flex:1')}${c('Marca', esc(vols.map((v) => v.marca).filter(Boolean).join(', ')), 'flex:1.6')}${c('Numeração', esc(vols.map((v) => v.nVol).filter(Boolean).join(', ')), 'flex:1.6')}${c('Peso bruto', n(somaVol('pesoB'), 3), `${R} flex:1`)}${c('Peso líquido', n(somaVol('pesoL'), 3), `${R} flex:1`)}</div>`;
  const linhasItens = itens.map((i) => `<tr><td>${esc(i.cod)}</td><td>${esc(i.desc)}</td><td>${esc(i.ncm)}</td><td class="m">${esc(i.cst)}</td><td class="m">${esc(i.cfop)}</td><td class="m">${esc(i.un)}</td><td class="n">${n(i.qtd, 4)}</td><td class="n">${nUnit(i.vun)}</td><td class="n">${n(i.vprod)}</td><td class="n">${n(i.bc)}</td><td class="n">${n(i.vicms)}</td><td class="n">${n(i.vipi)}</td><td class="n">${n(i.aicms, 4)}</td><td class="n">${n(i.aipi)}</td></tr>`).join('');

  return { numero: ide.nNF, folha: `<div class="pag" data-danfe="${id}">${modelo}${marcaHtml}<div class="conteudo">${canhoto}${cabecalho}${destinatario}${fatura}${imposto}${transportador}
    <div class="tit">Dados do produto/serviço</div><table class="itens">${thead}<tbody>${linhasItens}</tbody></table>${continuacaoInfo}</div>${rodape}</div>` };
}

const ESTILO = `
  @page { size: A4; margin: 6mm; } * { box-sizing: border-box; }
  body { font: 8pt "Times New Roman", Times, "Liberation Serif", serif; color: #000; margin: 0; }
  .pag { width: 198mm; height: 284mm; margin: 0 auto; position: relative; display: flex; flex-direction: column; overflow: hidden; }
  .pag + .pag { break-before: page; page-break-before: always; }
  @media screen { body { background: #888; padding: 10px 0; } .pag { background: #fff; padding: 0; box-shadow: 0 2px 8px rgba(0,0,0,.4); } .pag + .pag { margin-top: 10mm; } }
  .conteudo { flex: none; } .rodape { margin-top: auto; padding: 2mm 0.6pt 0.8mm 0; }
  .linha { display: flex; } .c { border: 0.6pt solid #000; margin: 0 -0.6pt -0.6pt 0; padding: 0.4mm 1mm; flex: 1; min-height: 6.6mm; min-width: 0; overflow: hidden; }
  .c.p .v { font-size: 8pt; } .c.pp .v { font-size: 6.6pt; }
  .r { display: block; font-size: 5.6pt; text-transform: uppercase; line-height: 1.1; } .v { display: block; font-size: 9.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tit { font-weight: bold; font-size: 7pt; margin: 1.6mm 0 0.3mm; text-transform: uppercase; }
  .canhoto .c { min-height: 0; } .canh-txt { font-size: 6.2pt; line-height: 1.15; padding: 0.4mm 1mm 0.6mm; text-transform: uppercase; border-bottom: 0.6pt solid #000; }
  .canhoto .linha .c { min-height: 7mm; } .canh-nf { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6mm; font-size: 9pt; }
  .canh-nf .g { font-size: 11pt; } .corte { border-top: 0.8pt dashed #000; margin: 1.6mm 0 1.6mm; }
  .cab { min-height: 41mm; } .cab > .c, .cab > .dir { min-height: 41mm; }
  .emit { flex: 2.35; padding: 1.5mm 2mm; } .emit-nome { display: block; font-size: 10pt; margin-bottom: 2mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .emit-corpo { display: flex; gap: 3mm; align-items: flex-start; } .logo { max-width: 30mm; max-height: 26mm; object-fit: contain; margin-top: 1mm; }
  .emit-end { font-size: 9pt; line-height: 1.35; flex: 1; min-width: 0; } .emit-mun { margin-top: 1.4mm; } .emit-ult { display: flex; gap: 6mm; margin-top: 1.6mm; white-space: nowrap; }
  .emit-corpo.largo { flex-direction: column; gap: 1mm; } .emit-corpo.largo .logo { max-width: 70mm; max-height: 15.5mm; margin: 0; }
  .emit-corpo.largo .emit-end { font-size: 8.5pt; line-height: 1.25; } .emit-corpo.largo .emit-mun { margin-top: 0; } .emit-corpo.largo .emit-ult { margin-top: 0.4mm; }
  .danfe-box { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.6mm; padding: 1.5mm 1mm; font-size: 9pt; }
  .danfe-box .g2 { font-size: 13pt; } .danfe-box .mini { font-size: 7pt; line-height: 1.15; }
  .es { display: flex; align-items: center; gap: 2mm; font-size: 7.5pt; text-align: left; font-weight: bold; } .tpnf { border: 0.8pt solid #000; padding: 0.6mm 2.4mm; font-size: 10pt; }
  .nfolha { font-size: 10pt; }
  .dir { flex: 2.1; display: flex; flex-direction: column; margin: 0 -0.6pt -0.6pt 0; } .dir .c { margin: 0 0 -0.6pt 0; }
  .barra { display: flex; align-items: center; justify-content: center; min-height: 15mm; } .barra svg { width: 94%; height: 12mm; }
  .chave { text-align: center; font-size: 7.8pt; font-weight: bold; } .consulta { flex: 1; text-align: center; font-size: 7.5pt; display: flex; align-items: center; justify-content: center; }
  table { width: 100%; border-collapse: collapse; } table.itens { table-layout: fixed; }
  th, td { border: 0.6pt solid #000; padding: 0.3mm 0.6mm; font-size: 6.6pt; vertical-align: top; line-height: 1.12; }
  th { font-size: 5.8pt; text-transform: uppercase; font-weight: normal; vertical-align: middle; } th.aliq { font-size: 5pt; padding: 0; }
  td { word-wrap: break-word; overflow-wrap: anywhere; } td.n { text-align: right; } td.m { text-align: center; } tr { break-inside: avoid; page-break-inside: avoid; }
  .info { flex: 2; height: 30mm; } .fisco { flex: 1; height: 30mm; } .mono { font: 6.4pt/1.2 "Courier New", Courier, "Liberation Mono", monospace; white-space: pre-wrap; text-transform: uppercase; }
  .cont-info { margin-top: 2mm; min-height: 0; } .cont-info .r2 { display: block; font-size: 6.6pt; text-transform: uppercase; margin-bottom: 0.6mm; } .cont-info .mono { white-space: normal; }
  .marca { position: absolute; top: 40%; left: 8%; font-size: 64px; color: rgba(200,0,0,.25); transform: rotate(-30deg); font-weight: bold; font-family: Arial, sans-serif; pointer-events: none; z-index: 5; }
  #danfeMm { position: absolute; visibility: hidden; height: 100mm; width: 1px; } .danfe-pronto .aguarde { display: none; }
  .botao { position: fixed; top: 8px; right: 8px; padding: 6px 12px; font-size: 12px; z-index: 10; } @media print { .botao { display: none; } body { background: #fff; } }
  `;
// Paginação A4 feita no navegador (src/danfePaginar.js), embutida na página: a política de segurança da rota do
// DANFE só aceita script embutido.
const PAGINAR = require('fs').readFileSync(require('path').join(__dirname, 'danfePaginar.js'), 'utf8');
const pagina = (titulo, folhas) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO}</style></head><body><div id="danfeMm"></div><button class="botao" onclick="print()">🖨 Imprimir / salvar PDF</button>${folhas}<script>${PAGINAR}</script></body></html>`;
// DANFE de uma nota, pronto para imprimir ou salvar em PDF.
function danfeHtml(xml, opcoes = {}) {
  const f = danfeFolha(xml, opcoes);
  return pagina(`DANFE ${f.numero}`, f.folha);
}
// Vários DANFE numa página só (um por folha): imprimir em lote ou salvar tudo num PDF.
// itens: [{ xml, marca }]. XML ilegível vira um aviso no lugar da folha.
function danfeLote(itens, opcoes = {}) {
  const folhas = itens.map((i) => { try { return danfeFolha(i.xml, { ...opcoes, ...i }).folha; } catch { return `<div class="pag"><div class="conteudo"><p>NF-e ${esc(i.numero || '')}: XML ilegível, DANFE não gerado.</p></div></div>`; } });
  return pagina(`DANFE (${itens.length} notas)`, folhas.join(''));
}
// Logo e CNPJ da empresa (o logo só vai na DANFE das notas emitidas por ela).
async function empresaDanfe() {
  try { const { rows: [e] } = await require('./db').query('SELECT logo, cnpj FROM empresa WHERE id = 1'); return e || null; } catch { return null; }
}

module.exports = { danfeHtml, danfeLote, danfeFolha, empresaDanfe, linhasDoTexto };
