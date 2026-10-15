// NFS-e Padrão Nacional (Sistema Nacional NFS-e, leiaute 1.01): monta a DPS
// (Declaração de Prestação de Serviço) que o prestador assina e envia; a
// Sefin Nacional devolve a NFS-e autorizada. Também monta o pedido de
// cancelamento (evento 101101) e lê o XML da NFS-e devolvida.
//
// Frete com início e fim no MESMO município não é CT-e (não tem ICMS): é
// serviço de transporte municipal, item 16.02 da LC 116/2003, com ISS.
const NS = 'http://www.sped.fazenda.gov.br/nfse';
const VERSAO = '1.01';
const VER_APLIC = 'NEXOFRETE-1';
// 16.02.01 — Outros serviços de transporte de natureza municipal.
const TRIB_NAC_PADRAO = '160201';

const so = (v) => String(v ?? '').replace(/\D/g, '');
// Texto aceito pelo leiaute: sem espaço nas pontas, sem caracteres fora do Latin-1.
const limpo = (v, max) => String(v ?? '').normalize('NFC').replace(/[^\x20-\xFF\n]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim().slice(0, max).trim();
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (nome, valor, max = 255) => { const x = limpo(valor, max); return x ? `<${nome}>${esc(x)}</${nome}>` : ''; };
const dec = (v) => { const n = Math.round(Number(v || 0) * 100) / 100; return n === 0 ? '0.00' : n.toFixed(2); };
const falha = (msg) => Object.assign(new Error(msg), { status: 400 });

// Data/hora com fuso de Brasília (o leiaute exige o TZD, sem milissegundos).
function dataHoraBr(d = new Date()) {
  return `${new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 19)}-03:00`;
}

// "DPS" + município (7) + tipo de inscrição (1: CPF, 2: CNPJ) + inscrição (14) + série (5) + número (15).
function idDps({ cMun, doc, serie, numero }) {
  const d = so(doc);
  return `DPS${so(cMun).padStart(7, '0')}${d.length === 11 ? '1' : '2'}${d.padStart(14, '0')}${String(serie).padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

// Situação no Simples Nacional a partir do CRT do cadastro fiscal
// (1/2 = Simples Nacional, 3 = regime normal, 4 = MEI).
function opSimpNac(crt) {
  const c = String(crt || '3');
  if (c === '4') return '2';
  if (c === '1' || c === '2') return '3';
  return '1';
}

function pessoa(p) {
  const d = so(p.doc);
  const end = p.end || {};
  const temEnd = so(end.cMun).length === 7 && so(end.cep).length === 8 && limpo(end.xLgr, 1) && limpo(end.xBairro, 1);
  return `${d.length === 11 ? `<CPF>${d}</CPF>` : `<CNPJ>${d}</CNPJ>`}${t('IM', p.im, 15)}${t('xNome', p.nome, 300)}`
    + (temEnd ? `<end><endNac><cMun>${so(end.cMun)}</cMun><CEP>${so(end.cep)}</CEP></endNac>${t('xLgr', end.xLgr)}${t('nro', end.nro || 'S/N', 60)}${t('xCpl', end.xCpl, 156)}${t('xBairro', end.xBairro, 60)}</end>` : '')
    + (so(p.fone).length >= 6 ? `<fone>${so(p.fone).slice(0, 20)}</fone>` : '') + (/^\S+@\S+\.\S+$/.test(String(p.email || '').trim()) ? t('email', p.email, 80) : '');
}

// d: { competencia, tomador, servico, valores }; emit: cadastro da empresa; cfg: configuração da NFS-e.
function montarDps(d, emit, cfg, { serie, numero, tpAmb, dhEmi = dataHoraBr() }) {
  const cMunEmit = so(emit.codigo_municipio);
  if (cMunEmit.length !== 7) throw falha('Informe o código IBGE do município da empresa na Configuração fiscal.');
  if (so(emit.cnpj).length !== 14) throw falha('CNPJ da empresa inválido.');
  const toma = d.tomador || {};
  if (![11, 14].includes(so(toma.doc).length)) throw falha('Informe o CNPJ/CPF do tomador (quem paga o serviço).');
  if (!limpo(toma.nome, 1)) throw falha('Informe o nome do tomador.');
  const serv = d.servico || {};
  const desc = limpo(serv.descricao, 2000);
  if (!desc) throw falha('Descreva o serviço prestado.');
  const vServ = Number(d.valores?.vServ);
  if (!(vServ > 0)) throw falha('Informe o valor do serviço.');
  const cLocPrest = so(serv.cLocPrestacao || cMunEmit);
  if (cLocPrest.length !== 7) throw falha('Município da prestação inválido (código IBGE de 7 dígitos).');
  const cTribNac = so(serv.cTribNac || cfg.cTribNac || TRIB_NAC_PADRAO);
  if (cTribNac.length !== 6) throw falha('Código de tributação nacional inválido (6 dígitos, ex.: 160201).');
  const cTribMun = so(serv.cTribMun || cfg.cTribMun);
  const cNBS = so(serv.cNBS || cfg.cNBS);
  const competencia = /^\d{4}-\d{2}-\d{2}$/.test(String(d.competencia || '')) ? d.competencia : dhEmi.slice(0, 10);
  const op = opSimpNac(emit.crt);
  const retido = !!d.valores?.issRetido;
  const pAliq = Number(d.valores?.pAliq ?? cfg.aliquota);
  // A alíquota vem do cadastro do município no Sistema Nacional; só vai na DPS quando a
  // configuração pede (alguns municípios exigem) ou quando o Simples Nacional retém ISS.
  const informarAliq = pAliq > 0 && (cfg.informar_aliquota || (op === '3' && retido));
  const desconto = Number(d.valores?.descontoIncond || 0);
  const id = idDps({ cMun: cMunEmit, doc: emit.cnpj, serie, numero });
  const xml = `<DPS xmlns="${NS}" versao="${VERSAO}"><infDPS Id="${id}">`
    + `<tpAmb>${Number(tpAmb) === 1 ? 1 : 2}</tpAmb><dhEmi>${dhEmi}</dhEmi><verAplic>${VER_APLIC}</verAplic>`
    + `<serie>${Number(serie)}</serie><nDPS>${Number(numero)}</nDPS><dCompet>${competencia}</dCompet><tpEmit>1</tpEmit><cLocEmi>${cMunEmit}</cLocEmi>`
    // Prestador emitente: nome e endereço não vão (o Sistema Nacional usa o cadastro).
    + `<prest><CNPJ>${so(emit.cnpj)}</CNPJ>${t('IM', cfg.inscricao_municipal || emit.inscricao_municipal, 15)}`
    + `${so(emit.telefone).length >= 6 ? `<fone>${so(emit.telefone).slice(0, 20)}</fone>` : ''}${/^\S+@\S+\.\S+$/.test(String(emit.email || '').trim()) ? t('email', emit.email, 80) : ''}`
    + `<regTrib><opSimpNac>${op}</opSimpNac>${op === '3' ? `<regApTribSN>${['1', '2', '3'].includes(String(cfg.regApTribSN)) ? cfg.regApTribSN : '1'}</regApTribSN>` : ''}`
    + `<regEspTrib>${['0', '1', '2', '3', '4', '5', '6', '9'].includes(String(cfg.regEspTrib)) ? cfg.regEspTrib : '0'}</regEspTrib></regTrib></prest>`
    + `<toma>${pessoa(toma)}</toma>`
    + `<serv><locPrest><cLocPrestacao>${cLocPrest}</cLocPrestacao></locPrest>`
    + `<cServ><cTribNac>${cTribNac}</cTribNac>${cTribMun.length === 3 ? `<cTribMun>${cTribMun}</cTribMun>` : ''}<xDescServ>${esc(desc)}</xDescServ>${cNBS.length === 9 ? `<cNBS>${cNBS}</cNBS>` : ''}</cServ>`
    + `${limpo(serv.informacoes, 2000) || limpo(serv.docRef, 255) ? `<infoCompl>${t('docRef', serv.docRef, 255)}${t('xInfComp', serv.informacoes, 2000)}</infoCompl>` : ''}</serv>`
    + `<valores><vServPrest><vServ>${dec(vServ)}</vServ></vServPrest>`
    + `${desconto > 0 ? `<vDescCondIncond><vDescIncond>${dec(desconto)}</vDescIncond></vDescCondIncond>` : ''}`
    + `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${retido ? 2 : 1}</tpRetISSQN>${informarAliq ? `<pAliq>${dec(pAliq)}</pAliq>` : ''}</tribMun>`
    + `<totTrib>${op !== '1' && Number(cfg.pTotTribSN) > 0 ? `<pTotTribSN>${dec(cfg.pTotTribSN)}</pTotTribSN>` : '<indTotTrib>0</indTotTrib>'}</totTrib></trib></valores>`
    + '</infDPS></DPS>';
  return { xml, id };
}

// Pedido de cancelamento (evento 101101). cMotivo: 1 erro na emissão, 2 serviço não prestado, 9 outros.
function montarCancelamento({ chave, cnpj, tpAmb, cMotivo, xMotivo, dhEvento = dataHoraBr() }) {
  const motivo = limpo(xMotivo, 255);
  if (motivo.length < 15) throw falha('Escreva o motivo do cancelamento com pelo menos 15 letras.');
  if (!/^\d{50}$/.test(String(chave || ''))) throw falha('Chave da NFS-e inválida.');
  const id = `PRE${chave}101101`;
  return {
    id,
    xml: `<pedRegEvento xmlns="${NS}" versao="${VERSAO}"><infPedReg Id="${id}"><tpAmb>${Number(tpAmb) === 1 ? 1 : 2}</tpAmb><verAplic>${VER_APLIC}</verAplic>`
      + `<dhEvento>${dhEvento}</dhEvento><CNPJAutor>${so(cnpj)}</CNPJAutor><chNFSe>${chave}</chNFSe>`
      + `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${['1', '2', '9'].includes(String(cMotivo)) ? cMotivo : '9'}</cMotivo><xMotivo>${esc(motivo)}</xMotivo></e101101></infPedReg></pedRegEvento>`,
  };
}

// Valor de uma tag simples (primeira ocorrência), dentro de um trecho opcional.
const tag = (xml, nome, dentro) => {
  let x = String(xml || '');
  if (dentro) { const m = new RegExp(`<(?:\\w+:)?${dentro}[\\s>][\\s\\S]*?</(?:\\w+:)?${dentro}>`).exec(x); x = m ? m[0] : ''; }
  const m = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(x);
  return m ? m[1].trim() : null;
};

// O que importa da NFS-e autorizada: número, chave, ISS calculado e valor líquido.
function lerNfse(xml) {
  const chave = (/<infNFSe[^>]*Id="NFS(\d{50})"/.exec(xml || '') || [])[1] || null;
  const valores = /<infNFSe[\s\S]*?<valores>([\s\S]*?)<\/valores>/.exec(xml || '');
  const v = valores ? valores[1] : '';
  const num = (nome) => { const x = tag(v, nome); return x == null ? null : Number(x); };
  return {
    chave, numero: Number(tag(xml, 'nNFSe')) || null, dhProc: tag(xml, 'dhProc'), localEmissao: tag(xml, 'xLocEmi'), localIncidencia: tag(xml, 'xLocIncid'),
    codigoVerificacao: tag(xml, 'cVerif'), pAliq: num('pAliqAplic'), vBC: num('vBC'), vISS: num('vISSQN'), vTotalRet: num('vTotalRet'), vLiq: num('vLiq'),
  };
}

// Dígito verificador da chave da NFS-e (módulo 11, pesos 2..9).
function dvChave(base49) {
  let soma = 0; let peso = 2;
  for (let i = base49.length - 1; i >= 0; i -= 1) { soma += Number(base49[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

module.exports = { NS, VERSAO, TRIB_NAC_PADRAO, montarDps, montarCancelamento, lerNfse, idDps, opSimpNac, dataHoraBr, dvChave, tag, limpo, so };
