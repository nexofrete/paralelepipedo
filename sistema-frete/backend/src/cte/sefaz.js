// Comunicação com os webservices do CT-e 4.00 (SOAP 1.2 com o certificado A1
// do emitente na conexão TLS): status do serviço, autorização síncrona,
// consulta pela chave e eventos (cancelamento, carta de correção).
const https = require('https');
const zlib = require('zlib');
const ufs = require('./ufs');

const { CODIGO_UF } = ufs;
const { NS, VERSAO } = require('./montarCte');

const SERVICOS = {
  recepcao: { operacao: 'CTeRecepcaoSincV4', metodo: 'cteRecepcao' },
  consulta: { operacao: 'CTeConsultaV4', metodo: 'cteConsultaCT' },
  status: { operacao: 'CTeStatusServicoV4', metodo: 'cteStatusServicoCT' },
  evento: { operacao: 'CTeRecepcaoEventoV4', metodo: 'cteRecepcaoEvento' },
};

// Lê o valor de uma tag simples do retorno (primeira ocorrência).
const tag = (xml, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml || ''); return m ? m[1].trim() : null; };
// Elemento inteiro (com as tags), ex.: protCTe.
const elemento = (xml, nome) => { const m = new RegExp(`<${nome}[\\s>][\\s\\S]*?</${nome}>`).exec(xml || ''); return m ? m[0] : null; };

function postar(url, corpo, acao, cert, { verificarServidor = false, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      agent: new https.Agent({ pfx: cert.pfx, passphrase: cert.senha, minVersion: 'TLSv1.2', rejectUnauthorized: !!verificarServidor, keepAlive: false }),
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${acao}"`, 'Content-Length': Buffer.byteLength(corpo) },
      timeout,
    }, (res) => {
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8');
        if (res.statusCode >= 500 && !/<(?:\w+:)?Body/.test(texto)) return reject(new Error(`A SEFAZ respondeu com erro ${res.statusCode}.`));
        if (res.statusCode >= 300 && res.statusCode < 500) return reject(new Error(`A SEFAZ recusou a conexão (HTTP ${res.statusCode}). Confira o certificado e o ambiente.`));
        resolve(texto);
      });
    });
    req.on('timeout', () => req.destroy(new Error('A SEFAZ não respondeu a tempo (60 s). Tente de novo em alguns minutos.')));
    req.on('error', (e) => {
      const msg = /certificate|self.signed|unable to verify/i.test(e.message)
        ? `Não consegui conferir o certificado do servidor da SEFAZ (${e.message}). Desligue "Verificar o certificado da SEFAZ" na Configuração fiscal ou instale as raízes ICP-Brasil.`
        : /ENOTFOUND|EAI_AGAIN/.test(e.code || '') ? 'Sem acesso ao endereço da SEFAZ — confira a internet deste servidor.'
          : `Falha na comunicação com a SEFAZ: ${e.message}`;
      reject(new Error(msg));
    });
    req.end(corpo);
  });
}

// simulado: modo demonstração — responde aqui mesmo (src/cte/simulador.js), sem ir à SEFAZ.
async function chamar(servico, { uf, tpAmb, cert, dados, verificarServidor, simulado }) {
  const ws = ufs.webservicesDaUf(uf, tpAmb);
  if (simulado) {
    const resposta = require('./simulador').responder(servico, dados, { uf: CODIGO_UF[uf], conhecido: simulado.conhecido });
    return { resposta, url: 'demonstração (simulado no servidor)', autorizador: 'DEMONSTRAÇÃO' };
  }
  const { operacao, metodo } = SERVICOS[servico];
  const nsWsdl = `${NS}/wsdl/${operacao}`;
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + `<soap12:Header><cteCabecMsg xmlns="${nsWsdl}"><cUF>${CODIGO_UF[uf]}</cUF><versaoDados>${VERSAO}</versaoDados></cteCabecMsg></soap12:Header>`
    + `<soap12:Body><cteDadosMsg xmlns="${nsWsdl}">${dados}</cteDadosMsg></soap12:Body></soap12:Envelope>`;
  const resposta = await postar(ws[servico], envelope, `${nsWsdl}/${metodo}`, cert, { verificarServidor });
  const falha = tag(resposta, 'Text') || tag(resposta, 'faultstring');
  if (falha && !tag(resposta, 'cStat')) throw new Error(`A SEFAZ recusou a mensagem: ${falha}`);
  return { resposta, url: ws[servico], autorizador: ws.autorizador };
}

const xmlStatus = (uf, tpAmb) => `<consStatServCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>${tpAmb}</tpAmb><cUF>${CODIGO_UF[uf]}</cUF><xServ>STATUS</xServ></consStatServCTe>`;
const xmlConsulta = (tpAmb, chave) => `<consSitCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chCTe>${chave}</chCTe></consSitCTe>`;

// Status do serviço: serve também para testar certificado e conexão.
async function statusServico({ uf, tpAmb, cert, verificarServidor, simulado }) {
  const dados = xmlStatus(uf, tpAmb);
  const r = await chamar('status', { uf, tpAmb, cert, dados, verificarServidor, simulado });
  return { cStat: tag(r.resposta, 'cStat'), xMotivo: tag(r.resposta, 'xMotivo'), tMed: tag(r.resposta, 'tMed'), autorizador: r.autorizador, url: r.url };
}

// Envia o CT-e assinado (autorização síncrona: a resposta já traz o protocolo).
async function autorizar({ uf, tpAmb, cert, xmlAssinado, verificarServidor, simulado }) {
  const xml = xmlAssinado.replace(/^<\?xml[^>]*\?>/, '');
  const dados = zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
  const r = await chamar('recepcao', { uf, tpAmb, cert, dados, verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retCTe') || r.resposta;
  const prot = elemento(ret, 'protCTe');
  return {
    cStat: tag(prot, 'cStat') || tag(ret, 'cStat'), xMotivo: tag(prot, 'xMotivo') || tag(ret, 'xMotivo'),
    nProt: tag(prot, 'nProt'), dhRecbto: tag(prot, 'dhRecbto'), protCTe: prot, retorno: ret,
  };
}

async function consultar({ uf, tpAmb, cert, chave, verificarServidor, simulado }) {
  const dados = xmlConsulta(tpAmb, chave);
  const r = await chamar('consulta', { uf, tpAmb, cert, dados, verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retConsSitCTe') || r.resposta;
  const prot = elemento(ret, 'protCTe');
  return { cStat: tag(ret, 'cStat'), xMotivo: tag(ret, 'xMotivo'), nProt: tag(prot, 'nProt'), protCTe: prot, retorno: ret };
}

// Evento já assinado (eventoCTe).
async function enviarEvento({ uf, tpAmb, cert, xmlEventoAssinado, verificarServidor, simulado }) {
  const dados = xmlEventoAssinado.replace(/^<\?xml[^>]*\?>/, '');
  const r = await chamar('evento', { uf, tpAmb, cert, dados, verificarServidor, simulado });
  const ret = elemento(r.resposta, 'retEventoCTe') || r.resposta;
  return { cStat: tag(ret, 'cStat'), xMotivo: tag(ret, 'xMotivo'), nProt: tag(ret, 'nProt'), dhRegEvento: tag(ret, 'dhRegEvento'), retorno: ret };
}

module.exports = { statusServico, autorizar, consultar, enviarEvento, tag, elemento, xmlStatus, xmlConsulta };
