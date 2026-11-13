// Endereço de entrega da NF-e, na ordem:
//   1. REDESPACHO escrito nos dados adicionais (infCpl): é para lá que a transportadora contratada leva
//      a carga (o frete é até o redespachante), então ele vem primeiro;
//   2. grupo <entrega> do XML (local de entrega diferente do destinatário, já com os campos separados);
//   3. "LOCAL DE ENTREGA", "ENDEREÇO DE ENTREGA", "ENTREGAR EM"... nos dados adicionais;
//   4. endereço do destinatário (<enderDest>).
// O texto livre é lido por partes (CNPJ, CEP, IE, rua e número, bairro, cidade e UF) e a cidade é
// conferida na lista oficial de municípios do IBGE. Quando a leitura não tem certeza, a nota fica
// marcada "conferir endereço" (com o motivo) em vez de gravar um endereço errado calado.
const Doc = require('./utils/documento');
const { municipio, ufsDaCidade, norm } = require('./roteirizacao/municipios');

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const ORIGENS = { redespacho: 'Redespacho', xml_entrega: 'Local de entrega (XML)', dados_adicionais: 'Dados adicionais', destinatario: 'Destinatário', manual: 'Corrigido à mão' };
// Tipo do logradouro: palavra inteira ou abreviação com ponto ("ROD." sim; "RODOFLUVIAL" não).
const TIPO_LOGRADOURO = String.raw`(?:(?:RUA|AVENIDA|RODOVIA|ESTRADA|ALAMEDA|TRAVESSA|PRA[CÇ]A|LARGO|VIA|QUADRA|SETOR|LINHA|TRECHO|CONDOM[IÍ]NIO|AV|ROD|PCA|QD)(?=[\s.])\.?|(?:R|ESTR?|AL|TV)\.|(?:BR|SP|RJ|MG|PR|SC|RS|GO|BA)[- ]\d{3}\b)`;
// Onde o bloco de um endereço termina nos dados adicionais.
const FIM_BLOCO = String.raw`(?=\s*(?:-\s*)?(?:FRETE\s+POR\s+CONTA|TERMO\s+DE\s+ISEN|\.\s*PEDIDO\s*:|PEDIDO\s*:|N[Rº°]?\.?\s*PEDIDO|REDESPACHO\s*:|LOCAL\s+DE\s+ENTREGA|ENDERE[CÇ]O\s+DE\s+ENTREGA|OBS(?:ERVA[CÇ][AÃ]O|ERVA[CÇ][OÕ]ES)?\s*:|DOCUMENTO\s+EMITIDO|INF(?:ORMA[CÇ][OÕ]ES)?\s+(?:DO\s+)?CONTRIBUINTE|VALOR\s+APROXIMADO|TRIBUTOS|PROCON|DEVOLU[CÇ][AÃ]O|\|\||\/\/|$))`;

const limpo = (t) => String(t || '').replace(/\s+/g, ' ').replace(/^[\s:;,.\-–]+|[\s:;,.\-–]+$/g, '').trim();
const semAcentoMaiusc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Procura a cidade num texto: rótulo "CIDADE:", "CIDADE/UF", "CIDADE - UF" ou pedaços conferidos no IBGE.
function acharCidade(texto, ufDada) {
  const T = semAcentoMaiusc(texto);
  const tentar = (cidade, uf) => {
    const c = limpo(cidade).replace(/\b(?:CEP|CNPJ|FONE|TEL|IE|I\.E)\b.*$/, '').trim();
    if (!c || c.length < 2) return null;
    if (uf) { const m = municipio({ cidade: c, uf }); return m ? { cidade: m.nome, uf: m.uf, ibge: m.ibge } : null; }
    const ufs = ufsDaCidade(c);
    if (ufs.length === 1) { const m = municipio({ cidade: c, uf: ufs[0] }); return m ? { cidade: m.nome, uf: m.uf, ibge: m.ibge } : null; }
    return null;
  };
  // Rótulos.
  const rotCid = T.match(/\b(?:CIDADE|MUNIC[IÍ]PIO|MUN)\s*[:.]\s*([A-Z' ]+?)(?=\s*(?:[-\/,]|\bUF\b|\bESTADO\b|\bCEP\b|\bCNPJ\b|\bFONE\b|\bTEL\b|\bI\.?E\b|$))/);
  const rotUf = T.match(/\b(?:UF|ESTADO)\s*[:.]\s*([A-Z]{2})\b/);
  const uf = ufDada || (rotUf && UFS.has(rotUf[1]) ? rotUf[1] : null);
  if (rotCid) {
    const ufPerto = T.slice(rotCid.index + rotCid[0].length, rotCid.index + rotCid[0].length + 8).match(/^\s*[-\/]\s*([A-Z]{2})\b/);
    const r = tentar(rotCid[1], uf || (ufPerto && UFS.has(ufPerto[1]) ? ufPerto[1] : null));
    if (r) return r;
  }
  // "GUARULHOS - SP", "GUARULHOS/SP", "GUARULHOS SP" (UF sozinha, de 2 letras).
  const pares = [...T.matchAll(/([A-Z][A-Z' ]{1,40}?)\s*(?:[-\/,]\s*|\s+)([A-Z]{2})(?=\s*(?:[-,.;]|\bCEP\b|\d|$))/g)];
  for (const p of pares.reverse()) {
    if (!UFS.has(p[2])) continue;
    // A cidade é o fim do pedaço antes da UF: tenta 1, 2, 3... palavras.
    const palavras = limpo(p[1].split(/[-,]/).pop()).split(' ');
    for (let n = Math.min(5, palavras.length); n >= 1; n -= 1) {
      const r = tentar(palavras.slice(-n).join(' '), p[2]);
      if (r) return r;
    }
  }
  // Sem UF: um pedaço separado por " - " ou "," (ou o fim dele) que só exista num estado.
  for (const s of T.split(/\s+-\s+|,/).reverse()) {
    const r = tentar(s, uf);
    if (r) return r;
    const palavras = limpo(s).split(' ');
    for (let n = Math.min(5, palavras.length - 1); n >= 2; n -= 1) {
      const r2 = tentar(palavras.slice(-n).join(' '), uf);
      if (r2) return r2;
    }
  }
  return null;
}

// Lê um endereço escrito em texto livre. Devolve os campos achados e a conferência.
function lerEndereco(texto) {
  const original = limpo(texto);
  if (!original) return null;
  const T = semAcentoMaiusc(original);
  const end = { nome: null, cnpj: null, ie: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, cep: null, ibge: null };
  // CNPJ (com ou sem rótulo; só vale com dígito certo).
  const cnpj = T.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2})/);
  if (cnpj && Doc.cnpjValido(cnpj[1].replace(/\D/g, ''))) end.cnpj = cnpj[1].replace(/\D/g, '');
  // CEP: com rótulo ou no formato 00000-000 / 00.000-000.
  const cep = T.match(/\bCEP\s*[:.]?\s*(\d{2}\.?\d{3}-?\d{3})\b/) || T.match(/\b(\d{2}\.?\d{3}-\d{3})\b/);
  if (cep) end.cep = cep[1].replace(/\D/g, '');
  const ie = T.match(/\bI\.?\s?E\.?\s*[:.]?\s*([\d.\/-]{6,20}|ISENTO)/);
  if (ie) end.ie = ie[1].replace(/[^\dA-Z]/g, '') || null;
  // Bairro com rótulo.
  const bairro = T.match(/\bBAIRRO\s*[:.]\s*([A-Z0-9' ]+?)(?=\s*(?:[-\/,]|\bCIDADE\b|\bMUNIC|\bCEP\b|\bUF\b|$))/);
  if (bairro) end.bairro = limpo(bairro[1]);
  // Rua e número: "END: ...", "ENDERECO: ..." ou a partir do tipo do logradouro.
  // Primeiro com os separadores claros (vírgula, " - ", "Nº"): mantém "RODOVIA BR 101 KM 25" inteiro.
  // Sem eles ("AV BRASIL 500 BAIRRO..."), o número é o primeiro número solto depois do nome.
  const fimNumero = String.raw`\s*(\d+[A-Z]?\b|S\/?N\b)?`;
  const reLogClaro = new RegExp(String.raw`\b(${TIPO_LOGRADOURO}\s*[A-Z0-9' .\/]{2,60}?)\s*(?:,|\s-\s|\bN[º°O]\.?\s*(?=\d)|\bNUMERO\s*[:.]?\s*(?=\d))${fimNumero}`);
  const reLogSolto = new RegExp(String.raw`\b(${TIPO_LOGRADOURO}\s*[A-Z' .]+?)\s(?=\d+\b)${fimNumero}`);
  const log = T.match(reLogClaro) || T.match(reLogSolto) || T.match(/\bEND(?:ERECO)?\.?\s*[:.]\s*([A-Z0-9' .]+?)\s*(?:,|\s-\s)\s*(\d+[A-Z]?|S\/?N)?/);
  let fimLog = -1;
  if (log) {
    end.logradouro = limpo(log[1]);
    end.numero = log[2] ? log[2].replace(/^S\/?N$/, 'S/N') : null;
    fimLog = log.index + log[0].length;
    // Complemento logo depois do número ("SALA 2", "GALPAO 3", "KM 12").
    const comp = T.slice(fimLog).match(/^\s*[-,]?\s*((?:SALA|GALP[AÃ]O|LOJA|BLOCO|BL|APTO|AP|CONJ|LOTE|LT|QUADRA|QD|KM|ANDAR|FUNDOS|BOX|DEPOSITO|ARMAZEM|PAVILH[AÃ]O)\b[^-,]*)/);
    if (comp) end.complemento = limpo(comp[1]);
    // Nome: o que vem antes do endereço (tira CNPJ e rótulos).
    const antes = limpo(T.slice(0, log.index).replace(/\bCNPJ\b.*$/, '').replace(/\bEND(?:ERECO)?\.?\s*[:.]?\s*$/, ''));
    if (antes && antes.length > 2 && !/^\d/.test(antes)) end.nome = antes.slice(0, 120);
  } else {
    const ate = T.search(/\bCNPJ\b|\bCEP\b|\bBAIRRO\b|\bCIDADE\b|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}/);
    // Sem rua nem rótulos: o nome é o primeiro pedaço ("TRANSP PEQUENA ME - ENTREGAR NO GALPAO...").
    const nome = ate > 2 ? T.slice(0, ate) : T.split(/\s+-\s+|,/)[0];
    if (limpo(nome).length > 2) end.nome = limpo(nome).slice(0, 120);
  }
  // Cidade e UF (conferidas no IBGE).
  const c = acharCidade(fimLog > 0 ? T.slice(fimLog) : T) || acharCidade(T);
  if (c) Object.assign(end, c);
  else {
    const u = T.match(/\b(?:UF|ESTADO)\s*[:.]\s*([A-Z]{2})\b/) || T.match(/[-\/]\s*([A-Z]{2})\s*(?:-|\bCEP\b|$)/);
    if (u && UFS.has(u[1])) end.uf = u[1];
  }
  // Bairro sem rótulo: o pedaço entre o número e a cidade ("..., 289 - CIDADE INDUSTRIAL - GUARULHOS - SP").
  if (!end.bairro && fimLog > 0) {
    const resto = T.slice(fimLog).split(/\s+-\s+|,/).map(limpo).filter(Boolean);
    const cand = resto.find((s) => !/\d{5}|\bCEP\b|\bCNPJ\b|\bI\.?E\b|\bFONE\b|\bTEL\b|\/\s*[A-Z]{2}$|^S\/?N$/.test(s) && s !== end.complemento
      && (!end.cidade || !norm(s).includes(norm(end.cidade))) && !UFS.has(s) && s.length > 2 && !/^(?:N[º°O]?\.?\s*)?\d+[A-Z]?$/.test(s)
      && !/^(?:SALA|GALP|LOJA|BLOCO|APTO|CONJ|LOTE|KM|ANDAR)\b/.test(s));
    if (cand) end.bairro = cand.slice(0, 80);
  }
  // Nome do lugar não pode ser a própria cidade/bairro.
  if (end.nome && end.cidade && norm(end.nome) === norm(end.cidade)) end.nome = null;
  return { ...end, texto: original.slice(0, 500), ...conferir(end) };
}

// O que falta para confiar no endereço. "conferir" = alguém precisa olhar.
function conferir(e) {
  const motivos = [];
  if (!e.cidade) motivos.push('cidade não reconhecida na lista do IBGE');
  else if (!e.uf) motivos.push('sem UF');
  if (!e.logradouro) motivos.push('rua/avenida não encontrada');
  if (!e.cep) motivos.push('sem CEP');
  else if (!/^\d{8}$/.test(e.cep)) motivos.push('CEP fora do padrão');
  // Só a cidade e a rua são essenciais (o frete é calculado pela cidade).
  return { conferir: !e.cidade || !e.uf || !e.logradouro, motivos };
}

// Blocos de endereço nos dados adicionais.
function blocoRedespacho(infCpl) {
  const m = String(infCpl || '').match(new RegExp(String.raw`REDESPACHO\s*[:\-]\s*([\s\S]+?)${FIM_BLOCO}`, 'i'));
  return m ? limpo(m[1]) : null;
}
function blocoLocalEntrega(infCpl) {
  const re = new RegExp(String.raw`(?:LOCAL\s+(?:DE\s+)?ENTREGA|ENDERE[CÇ]O\s+(?:DE|PARA)\s+ENTREGA|END\.?\s+(?:DE\s+)?ENTREGA|ENTREGAR\s+(?:NO|NA|EM|NO\s+ENDERE[CÇ]O)|ENTREGA\s+(?:NO|NA|EM)\s+(?=${TIPO_LOGRADOURO}|[A-Z]))\s*[:\-]?\s*([\s\S]+?)${FIM_BLOCO}`, 'i');
  const m = String(infCpl || '').match(re);
  if (!m) return null;
  const b = limpo(m[1]);
  // "ENTREGA EM 10/11/2026", "ENTREGAR ATÉ...", "ENTREGA EM HORÁRIO COMERCIAL": não é endereço.
  if (/^\d{1,2}\/\d{1,2}|^(?:ATE|ATÉ|HORARIO|HORÁRIO|DIAS?|ATE O|AGENDAD)/i.test(b)) return null;
  return b;
}

const deXml = (g, origem) => (g ? {
  nome: g.xNome ? String(g.xNome) : null, cnpj: Doc.limpar(g.CNPJ || g.CPF) || null, ie: g.IE ? String(g.IE) : null,
  logradouro: g.xLgr ? String(g.xLgr) : null, numero: g.nro != null ? String(g.nro) : null, complemento: g.xCpl ? String(g.xCpl) : null,
  bairro: g.xBairro ? String(g.xBairro) : null, cidade: g.xMun ? String(g.xMun) : null, uf: g.UF ? String(g.UF) : null,
  cep: g.CEP ? String(g.CEP).replace(/\D/g, '') : null, ibge: g.cMun ? String(g.cMun) : null, origem,
} : null);

// Tudo de uma vez a partir do <infNFe> já lido: { entrega, redespacho, efetivo: 'redespacho'|..., conferir, motivo }.
function daNfe(inf) {
  const infCpl = String(inf?.infAdic?.infCpl || '');
  const dest = inf?.dest || {};
  // Local de entrega final (para quem recebe): <entrega>, senão dados adicionais, senão destinatário.
  let entrega = deXml(inf?.entrega, 'xml_entrega');
  if (entrega) Object.assign(entrega, conferir(entrega), { conferir: false });   // campos do XML: confiáveis
  if (!entrega) {
    const b = blocoLocalEntrega(infCpl);
    const lido = b ? lerEndereco(b) : null;
    if (lido && (lido.cidade || lido.logradouro)) entrega = { ...lido, origem: 'dados_adicionais' };
  }
  if (!entrega) { entrega = deXml(dest.enderDest, 'destinatario'); if (entrega) Object.assign(entrega, { nome: dest.xNome ? String(dest.xNome) : null, conferir: false, motivos: [] }); }
  // Redespacho (para onde a transportadora contratada leva).
  const br = blocoRedespacho(infCpl);
  const redespacho = br ? { ...lerEndereco(br), origem: 'redespacho' } : null;
  const efetivo = redespacho || entrega;
  return {
    entrega, redespacho, origem: efetivo?.origem || null,
    conferir: !!efetivo?.conferir, motivo: efetivo?.conferir ? (efetivo.motivos || []).join('; ') : null,
  };
}

// "Rua X, 289 — Bairro — Cidade/UF — CEP 00000-000"
function textoEndereco(e) {
  if (!e) return '';
  const cep = e.cep && /^\d{8}$/.test(e.cep) ? `CEP ${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep ? `CEP ${e.cep}` : '';
  return [[e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '), e.bairro, e.cidade || e.uf ? `${e.cidade || ''}/${e.uf || ''}` : '', cep].filter(Boolean).join(' — ');
}

module.exports = { ORIGENS, lerEndereco, conferir, blocoRedespacho, blocoLocalEntrega, daNfe, textoEndereco, acharCidade };
