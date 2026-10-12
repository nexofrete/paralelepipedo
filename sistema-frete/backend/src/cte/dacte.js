// DACTE (Documento Auxiliar do CT-e) em HTML pronto para imprimir em A4.
// Segue os blocos do leiaute do Manual do CT-e: cabeçalho com chave e código
// de barras, prestação, participantes, valores, impostos, documentos, modal.
const QRCode = require('qrcode');
const { code128Svg } = require('./codigoBarras');
const { webservicesDaUf } = require('./ufs');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const moeda = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const docFmt = (v) => {
  const d = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};
const chaveFmt = (c) => String(c || '').replace(/(.{4})/g, '$1 ').trim();
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const TOMADOR = { 0: 'Remetente', 1: 'Expedidor', 2: 'Recebedor', 3: 'Destinatário', 4: 'Outros' };
const UNIDADE = { '00': 'M3', '01': 'KG', '02': 'TON', '03': 'UNIDADE', '04': 'LITROS', '05': 'MMBTU' };

function campo(rotulo, valor, estilo = '') {
  return `<div class="c" style="${estilo}"><span class="r">${esc(rotulo)}</span><span class="v">${valor ?? ''}</span></div>`;
}
function participante(titulo, p) {
  if (!p) return `<div class="bloco part"><div class="tit">${titulo}</div><div class="v">—</div></div>`;
  const e = p.endereco || {};
  return `<div class="bloco part"><div class="tit">${titulo}</div>
    <div><b>${esc(p.xNome)}</b></div>
    <div>${esc([e.xLgr, e.nro, e.xCpl].filter(Boolean).join(', '))} — ${esc(e.xBairro)}</div>
    <div>${esc(e.xMun)} / ${esc(e.UF)} ${e.CEP ? `— CEP ${esc(e.CEP)}` : ''}</div>
    <div>CNPJ/CPF: ${esc(docFmt(p.cnpj || p.cpf))} &nbsp; IE: ${esc(p.ie || '')} ${p.fone ? `&nbsp; Fone: ${esc(p.fone)}` : ''}</div></div>`;
}
function grupoIcms(i = {}) {
  const cst = String(i.cst || '00');
  const desc = { '00': '00 - Tributação normal', OUTRAUF: '90 - ICMS devido a outra UF', 20: '20 - Com redução de base', 40: '40 - Isenta', 41: '41 - Não tributada', 51: '51 - Diferido', 60: '60 - Cobrado por ST', 90: '90 - Outros', SN: 'Simples Nacional' }[cst] || cst;
  return `<div class="linha">${campo('Situação tributária', esc(desc), 'flex:2')}${campo('Base de cálculo', moeda(i.vBC))}${campo('Alíq. ICMS', i.pICMS != null && i.pICMS !== '' ? `${moeda(i.pICMS)}%` : '')}${campo('Valor ICMS', moeda(i.vICMS))}${campo('% Red. BC', i.pRedBC ? moeda(i.pRedBC) : '')}</div>`;
}

// d: dados completos (emissao.dadosParaXml); reg: linha de ctes_emitidos.
async function gerarDacte(d, reg) {
  const em = d.emitente;
  const homolog = Number(reg.ambiente) === 2;
  const autorizado = reg.status === 'autorizado' || reg.status === 'cancelado';
  const ws = webservicesDaUf(em.endereco.UF, reg.ambiente);
  const qr = reg.chave ? await QRCode.toString(`${ws.qrCode}?chCTe=${reg.chave}&tpAmb=${reg.ambiente}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : '';
  const tarja = reg.status === 'cancelado' ? 'CANCELADO' : !autorizado ? 'SEM VALOR FISCAL — NÃO AUTORIZADO'
    : reg.demonstracao ? 'DEMONSTRAÇÃO — NÃO ENVIADO À SEFAZ' : homolog ? 'SEM VALOR FISCAL — HOMOLOGAÇÃO' : '';
  const comps = (d.valores?.componentes || []).filter((c) => Number(c.vComp) > 0);
  const qtds = (d.carga?.quantidades || []);
  // Data/hora de emissão que foi no XML enviado à SEFAZ.
  const dhEmi = /<dhEmi>([^<]+)<\/dhEmi>/.exec(reg.xml_autorizado || reg.xml_assinado || '')?.[1] || null;
  const destinatario = homolog && autorizado ? { ...d.destinatario, xNome: 'CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' } : d.destinatario;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DACTE ${esc(reg.numero || 'rascunho')}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; margin: 0; background: #fff; }
  .pagina { width: 194mm; margin: 0 auto; position: relative; }
  .bloco { border: 1px solid #000; margin-top: -1px; padding: 3px 4px; }
  .linha { display: flex; border: 1px solid #000; margin-top: -1px; }
  .linha > .c { flex: 1; border-left: 1px solid #000; padding: 2px 4px; min-height: 22px; }
  .linha > .c:first-child { border-left: 0; }
  .r { display: block; font-size: 7px; text-transform: uppercase; color: #333; }
  .v { display: block; font-size: 9.5px; font-weight: bold; word-break: break-word; }
  .tit { font-size: 7.5px; font-weight: bold; text-transform: uppercase; background: #eee; margin: -3px -4px 3px; padding: 2px 4px; border-bottom: 1px solid #000; }
  .cab { display: flex; border: 1px solid #000; }
  .cab > div { padding: 4px; }
  .emit { flex: 1.3; border-right: 1px solid #000; }
  .emit .nome { font-size: 12px; font-weight: bold; }
  .titulo { flex: 0.9; border-right: 1px solid #000; text-align: center; }
  .titulo h1 { font-size: 16px; margin: 2px 0; }
  .chave { flex: 1.6; }
  .qr { width: 26mm; display: flex; align-items: center; justify-content: center; border-left: 1px solid #000; }
  .qr svg { width: 24mm; height: 24mm; }
  .duas { display: flex; } .duas > .part { flex: 1; } .duas > .part + .part { border-left: 0; }
  .part { min-height: 62px; }
  table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #000; padding: 2px 4px; text-align: left; font-size: 9px; }
  th { font-size: 7px; text-transform: uppercase; background: #f3f3f3; }
  .tarja { position: absolute; top: 120mm; left: 0; right: 0; text-align: center; font-size: 34px; font-weight: bold; color: rgba(200,0,0,0.22); transform: rotate(-28deg); pointer-events: none; }
  .acoes { text-align: center; margin: 10px; } .acoes button { font-size: 14px; padding: 8px 18px; cursor: pointer; }
  @media print { .acoes { display: none; } }
</style></head><body>
<div class="acoes"><button onclick="window.print()">Imprimir DACTE</button></div>
<div class="pagina">
  ${tarja ? `<div class="tarja">${esc(tarja)}</div>` : ''}
  <div class="cab">
    <div class="emit"><div class="nome">${esc(em.xNome)}</div>
      <div>${esc([em.endereco.xLgr, em.endereco.nro, em.endereco.xCpl].filter(Boolean).join(', '))}</div>
      <div>${esc(em.endereco.xBairro)} — ${esc(em.endereco.xMun)} / ${esc(em.endereco.UF)} ${em.endereco.CEP ? `— CEP ${esc(em.endereco.CEP)}` : ''}</div>
      <div>CNPJ: ${esc(docFmt(em.cnpj))} &nbsp; IE: ${esc(em.ie || '')}</div>
      <div>Fone: ${esc(em.fone || em.endereco.fone || '')} &nbsp; RNTRC: ${esc(em.rntrc || '')}</div></div>
    <div class="titulo"><h1>DACTE</h1><div>Documento Auxiliar do<br>Conhecimento de Transporte Eletrônico</div>
      <div style="margin-top:4px;"><b>MODAL RODOVIÁRIO</b></div></div>
    <div class="chave">
      ${reg.chave ? code128Svg(reg.chave, { altura: 40 }) : '<div style="height:40px"></div>'}
      <span class="r">Chave de acesso</span><span class="v" style="font-size:9px;">${esc(chaveFmt(reg.chave)) || '— (gerada ao transmitir)'}</span>
      <span class="r" style="margin-top:3px;">Consulta em ${esc(ws.qrCode.replace(/\/qr.*$/i, ''))} ou pelo QR Code</span>
    </div>
    <div class="qr">${qr}</div>
  </div>
  <div class="linha">${campo('Modelo', '57')}${campo('Série', esc(reg.serie ?? ''))}${campo('Número', esc(reg.numero ?? ''))}${campo('Folha', '1/1')}
    ${campo('Data e hora de emissão', esc(dataHora(dhEmi || reg.criado_em)), 'flex:2')}${campo('Protocolo de autorização', esc(reg.protocolo ? `${reg.protocolo} — ${dataHora(reg.autorizado_em)}` : ''), 'flex:3')}</div>
  <div class="linha">${campo('Tipo do CT-e', 'Normal')}${campo('Tipo do serviço', 'Normal')}${campo('Tomador do serviço', esc(TOMADOR[String(d.tomador ?? '0')]))}${campo('Forma de pagamento', '')}
    ${campo('CFOP — Natureza da prestação', esc(`${d.cfop || ''} — ${d.natOp || ''}`), 'flex:3')}</div>
  <div class="linha">${campo('Início da prestação', esc(`${d.inicio?.xMun || ''} / ${d.inicio?.UF || ''}`), 'flex:2')}${campo('Término da prestação', esc(`${d.fim?.xMun || ''} / ${d.fim?.UF || ''}`), 'flex:2')}</div>
  <div class="duas">${participante('Remetente', d.remetente)}${participante('Destinatário', destinatario)}</div>
  ${String(d.tomador) === '4' ? participante('Tomador do serviço', d.outroTomador) : ''}
  <div class="linha">${campo('Produto predominante', esc(d.carga?.proPred), 'flex:3')}${campo('Outras características', esc(d.carga?.xOutCat || ''), 'flex:2')}${campo('Valor total da carga', moeda(d.carga?.vCarga), 'flex:1.5')}</div>
  <div class="linha">${qtds.map((q) => campo(`${q.tpMed || 'Quantidade'} (${UNIDADE[String(q.cUnid).padStart(2, '0')] || q.cUnid})`, moeda(q.qCarga).replace(/,00$/, ''))).join('') || campo('Quantidade', '')}</div>
  <div class="bloco"><div class="tit">Componentes do valor da prestação do serviço</div>
    <table><tr>${comps.map((c) => `<th>${esc(c.xNome)}</th>`).join('')}<th>Valor total do serviço</th><th>Valor a receber</th></tr>
    <tr>${comps.map((c) => `<td>${moeda(c.vComp)}</td>`).join('')}<td><b>${moeda(d.valores?.vTPrest)}</b></td><td><b>${moeda(d.valores?.vRec ?? d.valores?.vTPrest)}</b></td></tr></table></div>
  <div class="bloco" style="padding:0;"><div class="tit" style="margin:0;">Informações relativas ao imposto</div></div>
  ${grupoIcms(d.icms)}
  <div class="bloco"><div class="tit">Documentos originários</div>
    <table><tr><th>Tipo</th><th>Chave de acesso da NF-e</th></tr>
    ${(d.nfes || []).map((c) => `<tr><td>NF-e</td><td>${esc(chaveFmt(c))}</td></tr>`).join('')}</table></div>
  <div class="bloco" style="min-height:48px;"><div class="tit">Observações</div>${esc(d.observacoes || '')}</div>
  <div class="linha">${campo('RNTRC da empresa', esc(em.rntrc || ''))}${campo('CIOT', '')}${campo('Data prevista de entrega', '')}
    ${campo('Este conhecimento de transporte atende à legislação de transporte rodoviário em vigor', '', 'flex:3')}</div>
  <div class="linha">${campo('Uso exclusivo do emissor do CT-e', '', 'flex:1')}${campo('Reservado ao fisco', '', 'flex:1')}</div>
</div></body></html>`;
}

module.exports = { gerarDacte };
