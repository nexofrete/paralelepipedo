// DANFE (Documento Auxiliar da NF-e) em HTML A4, retrato, montado do XML guardado:
// emitente, chave com código de barras, protocolo, destinatário, cálculo do imposto,
// transportador/volumes, itens e dados adicionais. Imprime ou salva em PDF pelo navegador.
const { lerXml } = require('./notasFiscais');
const { code128Svg } = require('./cte/codigoBarras');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const n = (v, c = 2) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
const doc = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};
const data = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const hora = (v) => (v && String(v).length > 11 ? String(v).slice(11, 19) : '');
const cep = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const MOD_FRETE = { 0: '0 - Por conta do Remetente (CIF)', 1: '1 - Por conta do Destinatário (FOB)', 2: '2 - Por conta de Terceiros', 3: '3 - Próprio por conta do Remetente', 4: '4 - Próprio por conta do Destinatário', 9: '9 - Sem Ocorrência de Transporte' };
const c = (rotulo, valor, estilo = '') => `<div class="c" style="${estilo}"><span class="r">${esc(rotulo)}</span><span class="v">${valor ?? ''}</span></div>`;

// Uma folha de DANFE (o miolo da página). marca: CANCELADA (a nota foi cancelada depois de autorizada).
function danfeFolha(xml, { marca = null } = {}) {
  const { inf, prot } = lerXml(xml);
  const ide = inf.ide || {}; const emit = inf.emit || {}; const ee = emit.enderEmit || {}; const dest = inf.dest || {}; const ed = dest.enderDest || {};
  const tot = inf.total?.ICMSTot || {}; const transp = inf.transp || {}; const tr = transp.transporta || {}; const vols = lista(transp.vol);
  const chave = String(inf['@_Id'] || '').replace(/\D/g, '');
  const somaVol = (k) => { const v = vols.map((x) => Number(x[k])).filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const itens = lista(inf.det).map((d) => {
    const p = d.prod || {}; const imp = d.imposto || {};
    const icms = Object.values(imp.ICMS || {})[0] || {}; const ipi = imp.IPI?.IPITrib || {};
    return { cod: p.cProd, desc: p.xProd, ncm: p.NCM, cst: icms.CST ?? icms.CSOSN ?? '', cfop: p.CFOP, un: p.uCom, qtd: p.qCom, vun: p.vUnCom, vprod: p.vProd, bc: icms.vBC, vicms: icms.vICMS, vipi: ipi.vIPI, aicms: icms.pICMS, aipi: ipi.pIPI };
  });
  const dups = lista(inf.cobr?.dup);
  const situacao = prot && ['110', '301', '302', '303'].includes(String(prot.cStat)) ? 'USO DENEGADO' : marca;
  return { numero: ide.nNF, folha: `<div class="pag"><div class="folha">${situacao ? `<div class="marca">${situacao}</div>` : ''}
  <div class="linha"><div class="c" style="flex:2.4;"><span class="r">Recebemos de ${esc(emit.xNome)} os produtos constantes da nota fiscal indicada ao lado</span><span class="v">&nbsp;</span>
    <div class="linha" style="margin-top:4px;">${c('Data de recebimento', '')}${c('Identificação e assinatura do recebedor', '', 'flex:3')}</div></div>
    <div class="c" style="text-align:center;"><span class="v" style="font-size:12px;">NF-e</span><span class="v">Nº ${esc(ide.nNF)}</span><span class="v">Série ${esc(ide.serie)}</span></div></div>
  <div class="linha" style="margin-top:6px;"><div class="c" style="flex:2.1;"><span class="v" style="font-size:11px;">${esc(emit.xNome)}</span><span>${esc([ee.xLgr, ee.nro, ee.xCpl].filter(Boolean).join(', '))}<br>${esc(ee.xBairro)} — ${esc(ee.xMun)}/${esc(ee.UF)} — CEP ${cep(ee.CEP)}${ee.fone ? `<br>Fone ${esc(ee.fone)}` : ''}</span></div>
    <div class="c" style="text-align:center;"><span class="v" style="font-size:13px;">DANFE</span><span>Documento Auxiliar da Nota Fiscal Eletrônica</span><span class="v">${String(ide.tpNF) === '0' ? '0 - ENTRADA' : '1 - SAÍDA'}</span><span class="v">Nº ${esc(ide.nNF)} · Série ${esc(ide.serie)}</span></div>
    <div class="c" style="flex:2;"><div class="barra">${chave.length === 44 ? code128Svg(chave, { altura: 40 }) : ''}</div><span class="r">Chave de acesso</span><span class="v">${esc(chave.replace(/(.{4})/g, '$1 ').trim())}</span>
      <span>Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da SEFAZ autorizadora</span></div></div>
  <div class="linha">${c('Natureza da operação', esc(ide.natOp), 'flex:2.1')}${c('Protocolo de autorização de uso', prot ? `${esc(prot.nProt || '')} ${data(prot.dhRecbto)} ${hora(prot.dhRecbto)}${situacao ? ` — ${situacao}: ${esc(prot.xMotivo)}` : ''}` : 'sem protocolo no XML', 'flex:2')}</div>
  <div class="linha">${c('Inscrição estadual', esc(emit.IE))}${c('Insc. estadual do subst. trib.', esc(emit.IEST))}${c('CNPJ / CPF', doc(emit.CNPJ || emit.CPF))}</div>
  <div class="tit">Destinatário / remetente</div>
  <div class="linha">${c('Nome / razão social', esc(dest.xNome), 'flex:3')}${c('CNPJ / CPF', doc(dest.CNPJ || dest.CPF))}${c('Data da emissão', data(ide.dhEmi || ide.dEmi))}</div>
  <div class="linha">${c('Endereço', esc([ed.xLgr, ed.nro, ed.xCpl].filter(Boolean).join(', ')), 'flex:2.4')}${c('Bairro / distrito', esc(ed.xBairro))}${c('CEP', cep(ed.CEP))}${c('Data da saída/entrada', data(ide.dhSaiEnt || ide.dSaiEnt))}</div>
  <div class="linha">${c('Município', esc(ed.xMun), 'flex:2')}${c('UF', esc(ed.UF))}${c('Fone / fax', esc(ed.fone))}${c('Inscrição estadual', esc(dest.IE))}${c('Hora da saída/entrada', esc(hora(ide.dhSaiEnt) || ide.hSaiEnt || ''))}</div>
  ${inf.entrega ? `<div class="tit">Local de entrega</div><div class="linha">${c('Nome', esc(inf.entrega.xNome), 'flex:2')}${c('Endereço', esc([inf.entrega.xLgr, inf.entrega.nro, inf.entrega.xCpl, inf.entrega.xBairro].filter(Boolean).join(', ')), 'flex:3')}${c('Município / UF', `${esc(inf.entrega.xMun)}/${esc(inf.entrega.UF)}`)}</div>` : ''}
  ${dups.length ? `<div class="tit">Fatura / duplicatas</div><div class="linha">${dups.slice(0, 12).map((d) => c(`Nº ${esc(d.nDup)} · venc. ${data(d.dVenc)}`, `R$ ${n(d.vDup)}`)).join('')}</div>` : ''}
  <div class="tit">Cálculo do imposto</div>
  <div class="linha">${c('Base de cálc. do ICMS', n(tot.vBC))}${c('Valor do ICMS', n(tot.vICMS))}${c('Base de cálc. ICMS ST', n(tot.vBCST))}${c('Valor do ICMS subst.', n(tot.vST))}${c('Valor total dos produtos', n(tot.vProd))}</div>
  <div class="linha">${c('Valor do frete', n(tot.vFrete))}${c('Valor do seguro', n(tot.vSeg))}${c('Desconto', n(tot.vDesc))}${c('Outras despesas', n(tot.vOutro))}${c('Valor do IPI', n(tot.vIPI))}${c('Valor total da nota', n(tot.vNF))}</div>
  <div class="tit">Transportador / volumes transportados</div>
  <div class="linha">${c('Nome / razão social', esc(tr.xNome), 'flex:2.5')}${c('Frete por conta', esc(MOD_FRETE[transp.modFrete] || transp.modFrete || ''), 'flex:1.6')}${c('Placa do veículo', esc(transp.veicTransp?.placa))}${c('UF', esc(transp.veicTransp?.UF))}${c('CNPJ / CPF', doc(tr.CNPJ || tr.CPF))}</div>
  <div class="linha">${c('Endereço', esc(tr.xEnder), 'flex:2.5')}${c('Município', esc(tr.xMun))}${c('UF', esc(tr.UF))}${c('Inscrição estadual', esc(tr.IE))}</div>
  <div class="linha">${c('Quantidade', n(somaVol('qVol'), 0))}${c('Espécie', esc(vols.map((v) => v.esp).filter(Boolean).join(', ')))}${c('Marca', esc(vols.map((v) => v.marca).filter(Boolean).join(', ')))}${c('Numeração', esc(vols.map((v) => v.nVol).filter(Boolean).join(', ')))}${c('Peso bruto', n(somaVol('pesoB'), 3))}${c('Peso líquido', n(somaVol('pesoL'), 3))}</div>
  <div class="tit">Dados dos produtos / serviços</div>
  <table><thead><tr><th>Código</th><th>Descrição do produto / serviço</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>Un</th><th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>B. cálc. ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th><th>Alíq. IPI</th></tr></thead><tbody>
  ${itens.map((i) => `<tr><td>${esc(i.cod)}</td><td>${esc(i.desc)}</td><td>${esc(i.ncm)}</td><td>${esc(i.cst)}</td><td>${esc(i.cfop)}</td><td>${esc(i.un)}</td><td class="n">${n(i.qtd, 4)}</td><td class="n">${n(i.vun, 4)}</td><td class="n">${n(i.vprod)}</td><td class="n">${n(i.bc)}</td><td class="n">${n(i.vicms)}</td><td class="n">${n(i.vipi)}</td><td class="n">${n(i.aicms)}</td><td class="n">${n(i.aipi)}</td></tr>`).join('')}</tbody></table>
  <div class="tit">Dados adicionais</div>
  <div class="linha"><div class="c" style="flex:2; min-height:22mm;"><span class="r">Informações complementares</span><span style="white-space:pre-wrap;">${esc(inf.infAdic?.infCpl || '')}</span></div><div class="c" style="min-height:22mm;"><span class="r">Reservado ao fisco</span><span>${esc(inf.infAdic?.infAdFisco || '')}</span></div></div>
  </div></div>` };
}

const ESTILO = `
  @page { size: A4; margin: 7mm; } * { box-sizing: border-box; } body { font: 8.5px Arial, Helvetica, sans-serif; color: #000; margin: 0; }
  .folha { width: 196mm; margin: 0 auto; position: relative; } .pag + .pag { break-before: page; page-break-before: always; } @media screen { .pag + .pag { margin-top: 12mm; padding-top: 8mm; border-top: 2px dashed #999; } } .linha { display: flex; } .bloco { border: 1px solid #000; margin-top: -1px; }
  .c { border: 1px solid #000; margin: 0 -1px -1px 0; padding: 1px 3px; flex: 1; min-height: 7mm; } .r { display: block; font-size: 6px; text-transform: uppercase; } .v { display: block; font-size: 9px; font-weight: bold; }
  .tit { font-weight: bold; font-size: 7.5px; margin: 4px 0 1px; text-transform: uppercase; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 1px 2px; font-size: 7px; }
  th { font-size: 6px; text-transform: uppercase; } td.n { text-align: right; } .marca { position: absolute; top: 40%; left: 10%; font-size: 60px; color: rgba(200,0,0,.25); transform: rotate(-30deg); font-weight: bold; }
  .barra svg { width: 100%; height: 12mm; } .botao { position: fixed; top: 8px; right: 8px; padding: 6px 12px; font-size: 12px; } @media print { .botao { display: none; } }
  `;
const pagina = (titulo, folhas) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO}</style></head><body><button class="botao" onclick="print()">🖨 Imprimir / salvar PDF</button>${folhas}</body></html>`;
// DANFE de uma nota, pronto para imprimir ou salvar em PDF.
function danfeHtml(xml, opcoes = {}) {
  const f = danfeFolha(xml, opcoes);
  return pagina(`DANFE ${f.numero}`, f.folha);
}
// Vários DANFE numa página só (um por folha): imprimir em lote ou salvar tudo num PDF.
// itens: [{ xml, marca }]. XML ilegível vira um aviso no lugar da folha.
function danfeLote(itens) {
  const folhas = itens.map((i) => { try { return danfeFolha(i.xml, i).folha; } catch { return `<div class="pag"><div class="folha"><p>NF-e ${esc(i.numero || '')}: XML ilegível, DANFE não gerado.</p></div></div>`; } });
  return pagina(`DANFE (${itens.length} notas)`, folhas.join(''));
}

module.exports = { danfeHtml, danfeLote, danfeFolha };
