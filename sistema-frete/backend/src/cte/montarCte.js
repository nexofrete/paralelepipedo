// Monta o XML do CT-e 4.00 (modelo 57, modal rodoviário, CT-e normal) a partir
// dos dados da tela. Não assina: a assinatura é feita depois (assinatura.js).
// A ordem e os formatos dos campos seguem o schema PL_CTe_400_RTC.
const crypto = require('crypto');
const { CODIGO_UF } = require('./ufs');

const NS = 'http://www.portalfiscal.inf.br/cte';
const VERSAO = '4.00';
const VER_PROC = 'Nexofrete 1.0';

// ---------- formatos ----------
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
// CNPJ pode ser alfanumérico (CNPJs novos a partir de 2026): letras maiúsculas e dígitos.
const cnpjLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Texto como o schema aceita: sem quebras de linha, sem espaço nas pontas,
// só caracteres até o ÿ (latin-1) — o resto vira espaço.
function texto(v, max) {
  if (v == null) return null;
  let t = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[^ -ÿ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (max) t = t.slice(0, max).trim();
  return t || null;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dec = (v, casas = 2) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v).toFixed(casas));
// Data/hora no fuso de Brasília, como o CT-e pede: AAAA-MM-DDThh:mm:ss-03:00.
function dataHoraBrasilia(data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  const fuso = (p.timeZoneName || 'GMT-03:00').replace('GMT', '') || '-03:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fuso}`;
}

// ---------- montagem: cada função devolve o XML do grupo, ou '' se vazio ----------
// t('xNome', valor): elemento de texto (some se o valor for vazio).
const t = (nome, valor) => (valor == null || valor === '' ? '' : `<${nome}>${esc(valor)}</${nome}>`);
// g('grupo', ...filhos): grupo com filhos (some se todos os filhos forem vazios).
const g = (nome, ...filhos) => { const c = filhos.join(''); return c ? `<${nome}>${c}</${nome}>` : ''; };

// ---------- chave de acesso ----------
function digitoVerificador(chave43) {
  let soma = 0; let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i -= 1) {
    // Letras do CNPJ alfanumérico valem (código ASCII − 48), como os dígitos.
    soma += (chave43.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
// Código numérico aleatório (8 dígitos), diferente do número do CT-e.
function codigoNumerico(nCT) {
  let c;
  do { c = String(crypto.randomInt(0, 100000000)).padStart(8, '0'); } while (Number(c) === Number(nCT));
  return c;
}
function montarChave({ uf, dhEmi, cnpj, serie, nCT, tpEmis = 1, cCT }) {
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
  const base = `${CODIGO_UF[uf]}${aamm}${cnpjLimpo(cnpj).padStart(14, '0')}57${String(serie).padStart(3, '0')}${String(nCT).padStart(9, '0')}${tpEmis}${cCT}`;
  if (base.length !== 43) throw new Error('Não consegui montar a chave de acesso: confira UF, CNPJ, série e número.');
  return base + digitoVerificador(base);
}

// ---------- pessoas e endereços ----------
function documento(p, opcional = false) {
  const doc = cnpjLimpo(p.cnpj || p.cpf);
  if (doc.length === 14) return t('CNPJ', doc);
  if (/^\d{11}$/.test(doc)) return t('CPF', doc);
  if (opcional) return '';
  throw new Error(`CNPJ/CPF inválido em "${p.xNome || 'participante'}".`);
}
// IE: só dígitos, "ISENTO", ou nada.
function ie(valor) {
  const v = String(valor ?? '').trim().toUpperCase();
  if (!v) return '';
  if (v === 'ISENTO') return t('IE', 'ISENTO');
  const d = soDigitos(v);
  return d ? t('IE', d) : '';
}
function endereco(nome, e, { comPais = false, comFone = null } = {}) {
  if (!e) throw new Error(`Endereço não informado (${nome}).`);
  const cMun = soDigitos(e.cMun);
  if (cMun.length !== 7) throw new Error(`Código IBGE do município inválido em ${nome} (${e.xMun || 'sem cidade'}): precisa ter 7 dígitos.`);
  const cep = soDigitos(e.CEP);
  return g(nome,
    t('xLgr', texto(e.xLgr, 255) || 'NAO INFORMADO'), t('nro', texto(e.nro, 60) || 'SN'), t('xCpl', texto(e.xCpl, 60)),
    t('xBairro', texto(e.xBairro, 60) || 'NAO INFORMADO'), t('cMun', cMun), t('xMun', texto(e.xMun, 60)),
    t('CEP', cep.length === 8 ? cep : null), t('UF', String(e.UF || '').toUpperCase()),
    comPais ? t('cPais', '1058') + t('xPais', 'BRASIL') : '',
    comFone ? t('fone', soDigitos(comFone).length >= 6 ? soDigitos(comFone).slice(0, 14) : null) : '');
}
function participante(nome, tagEnder, p, { comFant = false } = {}) {
  if (!p) return '';
  return g(nome,
    documento(p), ie(p.ie), t('xNome', texto(p.xNome, 60)), comFant ? t('xFant', texto(p.xFant, 60)) : '',
    t('fone', soDigitos(p.fone).length >= 6 ? soDigitos(p.fone).slice(0, 14) : null),
    endereco(tagEnder, p.endereco, { comPais: true }),
    t('email', texto(p.email, 60)));
}
// Indicador da IE do tomador: 1 contribuinte, 2 isento, 9 não contribuinte.
function indicadorIE(p) {
  const v = String(p?.ie ?? '').trim().toUpperCase();
  if (v === 'ISENTO') return 2;
  return soDigitos(v) ? 1 : 9;
}

// ---------- impostos ----------
function grupoIcms(icms = {}) {
  const cst = String(icms.cst || '00');
  if (cst === 'SN') return g('ICMSSN', t('CST', '90'), t('indSN', '1'));
  if (cst === '00') return g('ICMS00', t('CST', '00'), t('vBC', dec(icms.vBC)), t('pICMS', dec(icms.pICMS)), t('vICMS', dec(icms.vICMS)));
  if (cst === '20') {
    return g('ICMS20', t('CST', '20'), t('pRedBC', dec(icms.pRedBC)), t('vBC', dec(icms.vBC)), t('pICMS', dec(icms.pICMS)), t('vICMS', dec(icms.vICMS)));
  }
  if (['40', '41', '51'].includes(cst)) return g('ICMS45', t('CST', cst));
  if (cst === '60') {
    return g('ICMS60', t('CST', '60'), t('vBCSTRet', dec(icms.vBC)), t('vICMSSTRet', dec(icms.vICMS)), t('pICMSSTRet', dec(icms.pICMS)), t('vCred', dec(icms.vCred)));
  }
  if (cst === '90') {
    return g('ICMS90', t('CST', '90'), t('pRedBC', Number(icms.pRedBC) > 0 ? dec(icms.pRedBC) : null), t('vBC', dec(icms.vBC)),
      t('pICMS', dec(icms.pICMS)), t('vICMS', dec(icms.vICMS)), t('vCred', dec(icms.vCred)));
  }
  throw new Error(`CST do ICMS não suportado: ${cst}.`);
}
// IBS/CBS (Reforma Tributária): opcional. Valores calculados pela base e alíquotas.
function grupoIbsCbs(r) {
  if (!r || !r.cst) return '';
  const base = Number(r.vBC) || 0;
  const valor = (p) => (base * (Number(p) || 0)) / 100;
  const vIBSUF = valor(r.pIBSUF); const vIBSMun = valor(r.pIBSMun); const vCBS = valor(r.pCBS);
  const comValores = ['000', '200', '220', '221'].includes(String(r.cst)) || base > 0;
  return g('IBSCBS', t('CST', String(r.cst).padStart(3, '0')), t('cClassTrib', soDigitos(r.cClassTrib).padStart(6, '0')),
    comValores ? g('gIBSCBS', t('vBC', dec(base)),
      g('gIBSUF', t('pIBSUF', dec(r.pIBSUF, 4)), t('vIBSUF', dec(vIBSUF))),
      g('gIBSMun', t('pIBSMun', dec(r.pIBSMun || 0, 4)), t('vIBSMun', dec(vIBSMun))),
      t('vIBS', dec(vIBSUF + vIBSMun)),
      g('gCBS', t('pCBS', dec(r.pCBS, 4)), t('vCBS', dec(vCBS)))) : '');
}

// ---------- CT-e ----------
// d: dados do CT-e (ver rotas/cteEmissao.js). Devolve { xml, chave, dhEmi, cCT }.
function montarCte(d) {
  const em = d.emitente;
  const ufEmit = String(em?.endereco?.UF || '').toUpperCase();
  if (!CODIGO_UF[ufEmit]) throw new Error('UF do emitente inválida — confira a Configuração fiscal.');
  if (!soDigitos(em.rntrc)) throw new Error('RNTRC do emitente não informado — confira a Configuração fiscal.');
  if (!d.remetente || !d.destinatario) throw new Error('Informe o remetente e o destinatário.');
  const nfes = (d.nfes || []).map(cnpjLimpo).filter((c) => c.length === 44);
  if (!nfes.length && !(d.outrosDocs || []).length) throw new Error('Informe pelo menos uma NF-e transportada (chave de 44 dígitos).');
  const vTPrest = Number(d.valores?.vTPrest);
  if (!(vTPrest > 0)) throw new Error('Informe o valor total da prestação.');
  const quantidades = (d.carga?.quantidades || []).filter((q) => Number(q.qCarga) >= 0 && q.cUnid);
  if (!quantidades.length) throw new Error('Informe a quantidade da carga (peso ou volumes).');

  const dhEmi = d.dhEmi || dataHoraBrasilia();
  const tpAmb = Number(d.ambiente) === 1 ? 1 : 2;
  const cCT = d.cCT || codigoNumerico(d.numero);
  const chave = montarChave({ uf: ufEmit, dhEmi, cnpj: em.cnpj, serie: d.serie, nCT: d.numero, cCT });
  const envio = d.envio || em.endereco;
  const toma = String(d.tomador ?? '0');
  const pessoaToma = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[toma];
  if (!pessoaToma) throw new Error('Tomador do serviço não informado.');
  // Homologação: a SEFAZ exige esse texto no nome do destinatário.
  const destinatario = tpAmb === 2
    ? { ...d.destinatario, xNome: 'CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' } : d.destinatario;

  const ide = g('ide',
    t('cUF', String(CODIGO_UF[ufEmit])), t('cCT', cCT), t('CFOP', soDigitos(d.cfop)), t('natOp', texto(d.natOp, 60) || 'PRESTACAO DE SERVICO DE TRANSPORTE'),
    t('mod', '57'), t('serie', String(Number(d.serie))), t('nCT', String(Number(d.numero))), t('dhEmi', dhEmi),
    t('tpImp', '1'), t('tpEmis', '1'), t('cDV', chave.slice(-1)), t('tpAmb', String(tpAmb)), t('tpCTe', '0'), t('procEmi', '0'),
    t('verProc', VER_PROC),
    t('cMunEnv', soDigitos(envio.cMun)), t('xMunEnv', texto(envio.xMun, 60)), t('UFEnv', String(envio.UF).toUpperCase()),
    t('modal', '01'), t('tpServ', '0'),
    t('cMunIni', soDigitos(d.inicio?.cMun)), t('xMunIni', texto(d.inicio?.xMun, 60)), t('UFIni', String(d.inicio?.UF || '').toUpperCase()),
    t('cMunFim', soDigitos(d.fim?.cMun)), t('xMunFim', texto(d.fim?.xMun, 60)), t('UFFim', String(d.fim?.UF || '').toUpperCase()),
    t('retira', d.retira ? '0' : '1'),
    t('indIEToma', String(indicadorIE(pessoaToma))),
    toma === '4'
      ? g('toma4', t('toma', '4'), documento(d.outroTomador), ie(d.outroTomador.ie), t('xNome', texto(d.outroTomador.xNome, 60)),
        t('fone', soDigitos(d.outroTomador.fone).length >= 6 ? soDigitos(d.outroTomador.fone).slice(0, 14) : null),
        endereco('enderToma', d.outroTomador.endereco, { comPais: true }), t('email', texto(d.outroTomador.email, 60)))
      : g('toma3', t('toma', toma)));

  const compl = g('compl', t('xObs', texto(d.observacoes, 2000)));

  const emit = g('emit',
    t('CNPJ', cnpjLimpo(em.cnpj)), ie(em.ie), t('xNome', texto(em.xNome, 60)), t('xFant', texto(em.xFant, 60)),
    endereco('enderEmit', em.endereco, { comFone: em.endereco.fone || em.fone }), t('CRT', String(em.crt || 3)));

  const comps = (d.valores?.componentes || []).filter((c) => texto(c.xNome) && Number(c.vComp) > 0)
    .map((c) => g('Comp', t('xNome', texto(c.xNome, 15)), t('vComp', dec(c.vComp)))).join('');
  const vRec = d.valores?.vRec != null && d.valores.vRec !== '' ? Number(d.valores.vRec) : vTPrest;
  const vPrest = g('vPrest', t('vTPrest', dec(vTPrest)), t('vRec', dec(vRec)), comps);

  const ibscbs = grupoIbsCbs(d.ibscbs);
  const imp = g('imp', g('ICMS', grupoIcms(d.icms)), t('vTotTrib', Number(d.vTotTrib) > 0 ? dec(d.vTotTrib) : null),
    t('infAdFisco', texto(d.infAdFisco, 2000)), ibscbs);

  const infCarga = g('infCarga',
    t('vCarga', dec(d.carga?.vCarga)), t('proPred', texto(d.carga?.proPred, 60) || 'DIVERSOS'), t('xOutCat', texto(d.carga?.xOutCat, 30)),
    quantidades.map((q) => g('infQ', t('cUnid', String(q.cUnid).padStart(2, '0')), t('tpMed', texto(q.tpMed, 20) || 'PESO BRUTO'), t('qCarga', dec(q.qCarga, 4)))).join(''));
  const infDoc = g('infDoc', nfes.map((c) => g('infNFe', t('chave', c))).join(''));
  const infModal = `<infModal versaoModal="${VERSAO}">${g('rodo', t('RNTRC', soDigitos(em.rntrc).padStart(8, '0').slice(-8)))}</infModal>`;
  const infCTeNorm = g('infCTeNorm', infCarga, infDoc, infModal);

  const rt = d.respTec;
  const infRespTec = rt && cnpjLimpo(rt.cnpj).length === 14
    ? g('infRespTec', t('CNPJ', cnpjLimpo(rt.cnpj)), t('xContato', texto(rt.xContato, 60)), t('email', texto(rt.email, 60)), t('fone', soDigitos(rt.fone).slice(0, 12)))
    : '';

  const infCte = `<infCte versao="${VERSAO}" Id="CTe${chave}">${ide}${compl}${emit}`
    + `${participante('rem', 'enderReme', d.remetente, { comFant: true })}`
    + `${participante('dest', 'enderDest', destinatario)}`
    + `${vPrest}${imp}${infCTeNorm}${infRespTec}</infCte>`;
  return { xml: `<CTe xmlns="${NS}">${infCte}</CTe>`, chave, dhEmi, cCT, tpAmb };
}

// QR Code do CT-e (vai em infCTeSupl, depois do infCte e antes da assinatura).
function incluirQrCode(xmlAssinado, urlQrCode, chave, tpAmb) {
  const supl = `<infCTeSupl><qrCodCTe>${esc(`${urlQrCode}?chCTe=${chave}&tpAmb=${tpAmb}`)}</qrCodCTe></infCTeSupl>`;
  return xmlAssinado.replace('</infCte>', `</infCte>${supl}`);
}

module.exports = { montarCte, montarChave, digitoVerificador, dataHoraBrasilia, incluirQrCode, texto, soDigitos, cnpjLimpo, esc, NS, VERSAO };
