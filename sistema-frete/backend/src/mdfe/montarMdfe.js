// Monta o XML do MDF-e 3.00 (modelo 58, modal rodoviário). Não assina.
// A ordem e os formatos seguem o schema PL_MDFe_300b (conferido com o
// xmllint nos testes). Autorizador único: SVRS.
const crypto = require('crypto');
const { CODIGO_UF } = require('../cte/ufs');
const { texto, soDigitos, cnpjLimpo, esc, digitoVerificador, dataHoraBrasilia } = require('../cte/montarCte');

const NS = 'http://www.portalfiscal.inf.br/mdfe';
const VERSAO = '3.00';
const VER_PROC = 'Nexofrete 1.0';
const QRCODE = 'https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode';

const t = (nome, valor) => (valor == null || valor === '' ? '' : `<${nome}>${esc(valor)}</${nome}>`);
const g = (nome, ...filhos) => { const c = filhos.join(''); return c ? `<${nome}>${c}</${nome}>` : ''; };
const dec = (v, casas = 2) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v).toFixed(casas));
const uf = (v) => String(v || '').trim().toUpperCase();
const placa = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Tabelas do manual (para a tela).
const TIPOS_CARGA = {
  '01': 'Granel sólido', '02': 'Granel líquido', '03': 'Frigorificada', '04': 'Conteinerizada', '05': 'Carga geral', '06': 'Neogranel',
  '07': 'Perigosa (granel sólido)', '08': 'Perigosa (granel líquido)', '09': 'Perigosa (frigorificada)', '10': 'Perigosa (conteinerizada)', '11': 'Perigosa (carga geral)',
};
const TIPOS_RODADO = { '01': 'Truck', '02': 'Toco', '03': 'Cavalo mecânico', '04': 'VAN', '05': 'Utilitário', '06': 'Outros' };
const TIPOS_CARROCERIA = { '00': 'Não aplicável', '01': 'Aberta', '02': 'Fechada / baú', '03': 'Granelera', '04': 'Porta-contêiner', '05': 'Sider' };

function codigoNumerico(n) {
  let c;
  do { c = String(crypto.randomInt(0, 100000000)).padStart(8, '0'); } while (Number(c) === Number(n));
  return c;
}
function montarChave({ ufEmit, dhEmi, cnpj, serie, numero, tpEmis = 1, cMDF }) {
  const base = `${CODIGO_UF[ufEmit]}${dhEmi.slice(2, 4)}${dhEmi.slice(5, 7)}${cnpjLimpo(cnpj).padStart(14, '0')}58`
    + `${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}${tpEmis}${cMDF}`;
  return base + digitoVerificador(base);
}
const documento = (doc, tagCnpj = 'CNPJ', tagCpf = 'CPF') => {
  const d = cnpjLimpo(doc);
  return d.length === 11 ? t(tagCpf, d) : d.length === 14 ? t(tagCnpj, d) : '';
};

function proprietario(p) {
  if (!p || !cnpjLimpo(p.doc)) return '';
  return g('prop', documento(p.doc), t('RNTRC', soDigitos(p.rntrc).padStart(8, '0').slice(-8)), t('xNome', texto(p.xNome, 60)),
    t('IE', p.ie ? soDigitos(p.ie) || 'ISENTO' : ''), t('UF', p.ie ? uf(p.uf) : ''), t('tpProp', p.ie ? String(p.tpProp ?? '2') : ''));
}

function veiculo(v, { tracao }) {
  const tara = Math.round(Number(v.tara) || 0);
  if (!placa(v.placa)) throw new Error(tracao ? 'Informe a placa do veículo de tração.' : 'Informe a placa do reboque.');
  if (!tara) throw new Error(`Informe a tara (kg) do veículo ${placa(v.placa)}.`);
  const capKG = v.capKG != null && v.capKG !== '' ? String(Math.round(Number(v.capKG))) : null;
  if (!tracao && !capKG) throw new Error(`Informe a capacidade (kg) do reboque ${placa(v.placa)}.`);
  return [
    t('cInt', texto(v.cInt, 10)), t('placa', placa(v.placa)), t('RENAVAM', soDigitos(v.renavam) || null), t('tara', String(tara)),
    t('capKG', capKG), t('capM3', v.capM3 != null && v.capM3 !== '' ? String(Math.round(Number(v.capM3))) : null), proprietario(v.prop),
  ].join('');
}

// d: { ambiente, serie, numero, cMDF, dhEmi, tpEmit, emitente: {...}, ufIni, ufFim, carregamento: [{cMun,xMun}], percurso: [UF],
//      descargas: [{ cMun, xMun, ctes: [chave], nfes: [chave] }], veiculo, reboques, condutores, ciot, valePedagio, contratantes,
//      seguros, prodPred: { tpCarga, xProd, NCM }, tot: { vCarga, cUnid, qCarga }, lacres, infCpl, infAdFisco, respTec }
function montarMdfe(d) {
  const em = d.emitente || {};
  const ufEmit = uf(em.endereco?.UF);
  if (!CODIGO_UF[ufEmit]) throw new Error('UF do emitente inválida.');
  const dhEmi = d.dhEmi || dataHoraBrasilia();
  const tpAmb = Number(d.ambiente) === 1 ? 1 : 2;
  const cMDF = d.cMDF || codigoNumerico(d.numero);
  const chave = montarChave({ ufEmit, dhEmi, cnpj: em.cnpj, serie: d.serie, numero: d.numero, cMDF });

  const descargas = (d.descargas || []).filter((x) => soDigitos(x.cMun).length === 7 && ((x.ctes || []).length || (x.nfes || []).length));
  if (!descargas.length) throw new Error('Informe ao menos um município de descarregamento com CT-e ou NF-e.');
  const qCTe = descargas.reduce((s, x) => s + (x.ctes || []).length, 0);
  const qNFe = descargas.reduce((s, x) => s + (x.nfes || []).length, 0);
  const tpEmit = String(d.tpEmit || (qCTe ? 1 : 2));
  if (tpEmit === '1' && qNFe && !qCTe) throw new Error('Prestador de serviço de transporte relaciona CT-e no MDF-e (NF-e só no transporte de carga própria).');
  const carregamento = (d.carregamento || []).filter((x) => soDigitos(x.cMun).length === 7);
  if (!carregamento.length) throw new Error('Informe o município de carregamento.');
  const ufIni = uf(d.ufIni); const ufFim = uf(d.ufFim);
  if (!CODIGO_UF[ufIni] || !CODIGO_UF[ufFim]) throw new Error('Informe a UF de início e de fim da viagem.');
  const percurso = (d.percurso || []).map(uf).filter((x) => CODIGO_UF[x] && x !== ufIni && x !== ufFim);
  const condutores = (d.condutores || []).filter((c) => texto(c.xNome) && soDigitos(c.cpf).length === 11);
  if (!condutores.length) throw new Error('Informe o motorista (nome e CPF).');
  const v = d.veiculo || {};
  if (!TIPOS_RODADO[v.tpRod]) throw new Error('Informe o tipo de rodado do veículo.');
  if (!TIPOS_CARROCERIA[v.tpCar]) throw new Error('Informe o tipo de carroceria do veículo.');
  if (!texto(d.prodPred?.xProd)) throw new Error('Informe o produto predominante.');
  const vCarga = Number(d.tot?.vCarga) || 0; const qCarga = Number(d.tot?.qCarga) || 0;
  if (!(vCarga > 0) || !(qCarga > 0)) throw new Error('Informe o valor e o peso total da carga.');

  const ide = g('ide',
    t('cUF', String(CODIGO_UF[ufEmit])), t('tpAmb', String(tpAmb)), t('tpEmit', tpEmit), t('tpTransp', d.tpTransp ? String(d.tpTransp) : null),
    t('mod', '58'), t('serie', String(Number(d.serie))), t('nMDF', String(Number(d.numero))), t('cMDF', cMDF), t('cDV', chave.slice(-1)),
    t('modal', '1'), t('dhEmi', dhEmi), t('tpEmis', '1'), t('procEmi', '0'), t('verProc', VER_PROC), t('UFIni', ufIni), t('UFFim', ufFim),
    carregamento.slice(0, 50).map((m) => g('infMunCarrega', t('cMunCarrega', soDigitos(m.cMun)), t('xMunCarrega', texto(m.xMun, 60)))).join(''),
    percurso.slice(0, 25).map((p) => g('infPercurso', t('UFPer', p))).join(''),
    t('dhIniViagem', d.dhIniViagem || null));

  const e = em.endereco || {};
  const emit = g('emit', documento(em.cnpj), t('IE', soDigitos(em.ie) || null), t('xNome', texto(em.xNome, 60)), t('xFant', texto(em.xFant, 60)),
    g('enderEmit', t('xLgr', texto(e.xLgr, 60)), t('nro', texto(e.nro, 60) || 'S/N'), t('xCpl', texto(e.xCpl, 60)), t('xBairro', texto(e.xBairro, 60)),
      t('cMun', soDigitos(e.cMun)), t('xMun', texto(e.xMun, 60)), t('CEP', soDigitos(e.CEP).length === 8 ? soDigitos(e.CEP) : null), t('UF', ufEmit),
      t('fone', soDigitos(em.fone).length >= 7 ? soDigitos(em.fone).slice(0, 12) : null), t('email', texto(em.email, 60))));

  const ciot = (d.ciot || []).filter((c) => cnpjLimpo(c.doc)).map((c) => g('infCIOT', t('CIOT', soDigitos(c.ciot) || null), documento(c.doc)));
  const vale = (d.valePedagio || []).filter((x) => cnpjLimpo(x.cnpjForn) && Number(x.vValePed) > 0)
    .map((x) => g('disp', t('CNPJForn', cnpjLimpo(x.cnpjForn)), documento(x.docPg, 'CNPJPg', 'CPFPg'), t('nCompra', texto(x.nCompra, 20)), t('vValePed', dec(x.vValePed))));
  const contratantes = (d.contratantes || []).filter((c) => cnpjLimpo(c.doc)).map((c) => g('infContratante', t('xNome', texto(c.xNome, 60)), documento(c.doc)));
  const infANTT = g('infANTT', t('RNTRC', soDigitos(em.rntrc) ? soDigitos(em.rntrc).padStart(8, '0').slice(-8) : null), ciot.join(''),
    vale.length ? g('valePed', vale.join('')) : '', contratantes.join(''));
  const rodo = g('rodo', infANTT,
    g('veicTracao', veiculo(v, { tracao: true }),
      condutores.slice(0, 10).map((c) => g('condutor', t('xNome', texto(c.xNome, 60)), t('CPF', soDigitos(c.cpf)))).join(''),
      t('tpRod', v.tpRod), t('tpCar', v.tpCar), t('UF', CODIGO_UF[uf(v.uf)] ? uf(v.uf) : null)),
    (d.reboques || []).filter((r) => placa(r.placa)).slice(0, 3).map((r) => g('veicReboque', veiculo(r, { tracao: false }), t('tpCar', r.tpCar || '00'), t('UF', CODIGO_UF[uf(r.uf)] ? uf(r.uf) : null))).join(''),
    (d.lacresRodo || []).filter(Boolean).map((l) => g('lacRodo', t('nLacre', texto(l, 20)))).join(''));
  const infModal = `<infModal versaoModal="${VERSAO}">${rodo}</infModal>`;

  const infDoc = g('infDoc', descargas.map((x) => g('infMunDescarga', t('cMunDescarga', soDigitos(x.cMun)), t('xMunDescarga', texto(x.xMun, 60)),
    (x.ctes || []).map((c) => g('infCTe', t('chCTe', soDigitos(c)))).join(''),
    (x.nfes || []).map((c) => g('infNFe', t('chNFe', soDigitos(c)))).join(''))).join(''));

  const seg = (d.seguros || []).filter((s) => s.respSeg).map((s) => g('seg',
    g('infResp', t('respSeg', String(s.respSeg)), String(s.respSeg) === '2' ? documento(s.respDoc) : ''),
    texto(s.xSeg) && cnpjLimpo(s.cnpjSeg) ? g('infSeg', t('xSeg', texto(s.xSeg, 30)), t('CNPJ', cnpjLimpo(s.cnpjSeg))) : '',
    t('nApol', texto(s.nApol, 20)), (s.nAver || []).filter(Boolean).map((a) => t('nAver', texto(a, 40))).join(''))).join('');

  const p = d.prodPred || {};
  const prodPred = g('prodPred', t('tpCarga', TIPOS_CARGA[p.tpCarga] ? p.tpCarga : '05'), t('xProd', texto(p.xProd, 120)),
    t('cEAN', soDigitos(p.cEAN) || null), t('NCM', soDigitos(p.NCM).length >= 2 ? soDigitos(p.NCM).slice(0, 8) : null));

  const tot = g('tot', t('qCTe', qCTe ? String(qCTe) : null), t('qNFe', qNFe ? String(qNFe) : null),
    t('vCarga', dec(vCarga)), t('cUnid', String(d.tot?.cUnid) === '02' ? '02' : '01'), t('qCarga', dec(qCarga, 4)));
  const lacres = (d.lacres || []).filter(Boolean).map((l) => g('lacres', t('nLacre', texto(l, 60)))).join('');
  const infAdic = g('infAdic', t('infAdFisco', texto(d.infAdFisco, 2000)), t('infCpl', texto(d.infCpl, 5000)));
  const rt = d.respTec;
  const infRespTec = rt && cnpjLimpo(rt.cnpj).length === 14 && texto(rt.xContato) && texto(rt.email) && soDigitos(rt.fone).length >= 7
    ? g('infRespTec', t('CNPJ', cnpjLimpo(rt.cnpj)), t('xContato', texto(rt.xContato, 60)), t('email', texto(rt.email, 60)), t('fone', soDigitos(rt.fone).slice(0, 12))) : '';

  const inf = `<infMDFe versao="${VERSAO}" Id="MDFe${chave}">${ide}${emit}${infModal}${infDoc}${seg}${prodPred}${tot}${lacres}${infAdic}${infRespTec}</infMDFe>`;
  return { xml: `<MDFe xmlns="${NS}">${inf}</MDFe>`, chave, dhEmi, cMDF, tpAmb, qCTe, qNFe };
}

// QR Code (infMDFeSupl, depois do infMDFe e antes da assinatura).
function incluirQrCode(xmlAssinado, chave, tpAmb) {
  return xmlAssinado.replace('</infMDFe>', `</infMDFe><infMDFeSupl><qrCodMDFe>${esc(`${QRCODE}?chMDFe=${chave}&tpAmb=${tpAmb}`)}</qrCodMDFe></infMDFeSupl>`);
}

// ---------- Eventos: cancelamento, encerramento, inclusão de condutor ----------
function montarEvento({ tpEvento, chave, cnpj, ufEmit, tpAmb, nSeq = 1, detalhe }) {
  const seq = String(Number(nSeq));
  return `<eventoMDFe xmlns="${NS}" versao="${VERSAO}"><infEvento Id="ID${tpEvento}${chave}${seq.padStart(3, '0')}">`
    + `<cOrgao>${CODIGO_UF[uf(ufEmit)]}</cOrgao><tpAmb>${Number(tpAmb) === 1 ? 1 : 2}</tpAmb>${documento(cnpj)}`
    + `<chMDFe>${chave}</chMDFe><dhEvento>${dataHoraBrasilia()}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${seq}</nSeqEvento>`
    + `<detEvento versaoEvento="${VERSAO}">${detalhe}</detEvento></infEvento></eventoMDFe>`;
}
function cancelamento({ chave, cnpj, ufEmit, tpAmb, nProt, justificativa }) {
  const xJust = texto(justificativa, 255);
  if (!xJust || xJust.length < 15) throw new Error('A justificativa do cancelamento precisa ter pelo menos 15 caracteres.');
  return montarEvento({ tpEvento: '110111', chave, cnpj, ufEmit, tpAmb,
    detalhe: `<evCancMDFe><descEvento>Cancelamento</descEvento><nProt>${nProt}</nProt><xJust>${esc(xJust)}</xJust></evCancMDFe>` });
}
// Encerramento: no destino, com a data e o município onde a viagem terminou.
function encerramento({ chave, cnpj, ufEmit, tpAmb, nProt, dtEnc, ufEnc, cMun }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dtEnc || ''))) throw new Error('Informe a data do encerramento.');
  if (!CODIGO_UF[uf(ufEnc)] || soDigitos(cMun).length !== 7) throw new Error('Informe o município (código IBGE) onde a viagem terminou.');
  return montarEvento({ tpEvento: '110112', chave, cnpj, ufEmit, tpAmb,
    detalhe: `<evEncMDFe><descEvento>Encerramento</descEvento><nProt>${nProt}</nProt><dtEnc>${dtEnc}</dtEnc><cUF>${CODIGO_UF[uf(ufEnc)]}</cUF><cMun>${soDigitos(cMun)}</cMun></evEncMDFe>` });
}
function inclusaoCondutor({ chave, cnpj, ufEmit, tpAmb, nSeq, xNome, cpf }) {
  if (!texto(xNome) || soDigitos(cpf).length !== 11) throw new Error('Informe o nome e o CPF do motorista.');
  return montarEvento({ tpEvento: '110114', chave, cnpj, ufEmit, tpAmb, nSeq,
    detalhe: `<evIncCondutorMDFe><descEvento>Inclusao Condutor</descEvento><condutor><xNome>${esc(texto(xNome, 60))}</xNome><CPF>${soDigitos(cpf)}</CPF></condutor></evIncCondutorMDFe>` });
}

module.exports = {
  montarMdfe, montarChave, incluirQrCode, cancelamento, encerramento, inclusaoCondutor, NS, VERSAO, QRCODE, TIPOS_CARGA, TIPOS_RODADO, TIPOS_CARROCERIA,
};
