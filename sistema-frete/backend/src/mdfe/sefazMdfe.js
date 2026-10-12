// Comunicação com os webservices do MDF-e 3.00 (SVRS, que autoriza o MDF-e
// de todas as UFs): status, autorização síncrona, consulta pela chave,
// eventos e consulta dos MDF-e não encerrados. SOAP 1.2 com o certificado A1
// na conexão, igual ao CT-e. Endereços conferidos com o sped-mdfe (nfephp-org).
const zlib = require('zlib');
const { CODIGO_UF } = require('../cte/ufs');
const { postar, tag, elemento } = require('../cte/sefaz');
const { NS, VERSAO } = require('./montarMdfe');

const SERVICOS = {
  recepcao: { operacao: 'MDFeRecepcaoSinc', metodo: 'mdfeRecepcao' },
  consulta: { operacao: 'MDFeConsulta', metodo: 'mdfeConsultaMDF' },
  status: { operacao: 'MDFeStatusServico', metodo: 'mdfeStatusServicoMDF' },
  evento: { operacao: 'MDFeRecepcaoEvento', metodo: 'mdfeRecepcaoEvento' },
  naoEncerrados: { operacao: 'MDFeConsNaoEnc', metodo: 'mdfeConsNaoEnc' },
};
// tpAmb 1 produção, 2 homologação. (Exportado para os testes trocarem o endereço.)
const enderecos = {
  webservice(servico, tpAmb) {
    const host = Number(tpAmb) === 1 ? 'mdfe.svrs.rs.gov.br' : 'mdfe-homologacao.svrs.rs.gov.br';
    const op = SERVICOS[servico].operacao;
    return `https://${host}/ws/${op}/${op}.asmx`;
  },
};

async function chamar(servico, { ufEmit, tpAmb, cert, dados, verificarServidor, simulado }) {
  const cUF = CODIGO_UF[String(ufEmit).toUpperCase()];
  if (simulado) {
    return { resposta: require('./simuladorMdfe').responder(servico, dados, { cUF, conhecido: simulado.conhecido }), url: 'demonstração (simulado no servidor)' };
  }
  const { operacao, metodo } = SERVICOS[servico];
  const nsWsdl = `${NS}/wsdl/${operacao}`;
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + `<soap12:Header><mdfeCabecMsg xmlns="${nsWsdl}"><cUF>${cUF}</cUF><versaoDados>${VERSAO}</versaoDados></mdfeCabecMsg></soap12:Header>`
    + `<soap12:Body><mdfeDadosMsg xmlns="${nsWsdl}">${dados}</mdfeDadosMsg></soap12:Body></soap12:Envelope>`;
  const url = enderecos.webservice(servico, tpAmb);
  const resposta = await postar(url, envelope, `${nsWsdl}/${metodo}`, cert, { verificarServidor });
  const falha = tag(resposta, 'Text') || tag(resposta, 'faultstring');
  if (falha && !tag(resposta, 'cStat')) throw new Error(`A SEFAZ recusou a mensagem: ${falha}`);
  return { resposta, url };
}

async function statusServico({ ufEmit, tpAmb, cert, verificarServidor, simulado }) {
  const dados = `<consStatServMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>${tpAmb}</tpAmb><xServ>STATUS</xServ></consStatServMDFe>`;
  const r = await chamar('status', { ufEmit, tpAmb, cert, dados, verificarServidor, simulado });
  return { cStat: tag(r.resposta, 'cStat'), xMotivo: tag(r.resposta, 'xMotivo'), tMed: tag(r.resposta, 'tMed'), autorizador: simulado ? 'DEMONSTRAÇÃO' : 'SVRS', url: r.url };
}

// MDF-e assinado (autorização síncrona: a resposta já traz o protocolo).
async function autorizar({ ufEmit, tpAmb, cert, xmlAssinado, verificarServidor, simulado }) {
  const dados = zlib.gzipSync(Buffer.from(xmlAssinado.replace(/^<\?xml[^>]*\?>/, ''), 'utf8')).toString('base64');
  const r = await chamar('recepcao', { ufEmit, tpAmb, cert, dados, verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retMDFe') || r.resposta;
  const prot = elemento(ret, 'protMDFe');
  return { cStat: tag(prot, 'cStat') || tag(ret, 'cStat'), xMotivo: tag(prot, 'xMotivo') || tag(ret, 'xMotivo'),
    nProt: tag(prot, 'nProt'), dhRecbto: tag(prot, 'dhRecbto'), protMDFe: prot, retorno: ret };
}

async function consultar({ ufEmit, tpAmb, cert, chave, verificarServidor, simulado }) {
  const dados = `<consSitMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${chave}</chMDFe></consSitMDFe>`;
  const r = await chamar('consulta', { ufEmit, tpAmb, cert, dados, verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retConsSitMDFe') || r.resposta;
  const prot = elemento(ret, 'protMDFe');
  return { cStat: tag(ret, 'cStat'), xMotivo: tag(ret, 'xMotivo'), nProt: tag(prot, 'nProt'), protMDFe: prot, retorno: ret };
}

async function enviarEvento({ ufEmit, tpAmb, cert, xmlEventoAssinado, verificarServidor, simulado }) {
  const r = await chamar('evento', { ufEmit, tpAmb, cert, dados: xmlEventoAssinado.replace(/^<\?xml[^>]*\?>/, ''), verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retEventoMDFe') || r.resposta;
  return { cStat: tag(ret, 'cStat'), xMotivo: tag(ret, 'xMotivo'), nProt: tag(ret, 'nProt'), dhRegEvento: tag(ret, 'dhRegEvento'), retorno: ret };
}

// MDF-e autorizados e ainda não encerrados do emitente (a SEFAZ recusa novo MDF-e
// para o mesmo veículo enquanto houver um aberto).
async function naoEncerrados({ ufEmit, tpAmb, cert, cnpj, verificarServidor, simulado }) {
  const doc = String(cnpj).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const dados = `<consMDFeNaoEnc xmlns="${NS}" versao="${VERSAO}"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR NÃO ENCERRADOS</xServ>`
    + `<${doc.length === 11 ? 'CPF' : 'CNPJ'}>${doc}</${doc.length === 11 ? 'CPF' : 'CNPJ'}></consMDFeNaoEnc>`;
  const r = await chamar('naoEncerrados', { ufEmit, tpAmb, cert, dados, verificarServidor, simulado });
  const lista = [...r.resposta.matchAll(/<infMDFe>([\s\S]*?)<\/infMDFe>/g)].map((m) => ({ chave: tag(m[1], 'chMDFe'), nProt: tag(m[1], 'nProt') }));
  return { cStat: tag(r.resposta, 'cStat'), xMotivo: tag(r.resposta, 'xMotivo'), mdfes: lista };
}

module.exports = { statusServico, autorizar, consultar, enviarEvento, naoEncerrados, enderecos, SERVICOS };
