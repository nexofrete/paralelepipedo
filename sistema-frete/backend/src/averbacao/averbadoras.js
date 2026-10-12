// Averbação do seguro de carga: manda o XML autorizado do CT-e (e a declaração
// do MDF-e) para a averbadora da seguradora e devolve o protocolo e o número
// de averbação. Também manda os XML de cancelamento/encerramento.
//
// - AT&M (webserver.averba.com.br): SOAP, métodos averbaCTe e declaraMDFe com
//   usuário, senha, código AT&M e o XML protocolado na SEFAZ.
// - Porto Seguro (AverbePorto): login (cookie de sessão) e upload do arquivo XML.
//
// Formatos conferidos com o manual de integração da AT&M e o projeto
// sped-averbacao (nfephp-org).
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const PROVEDORES = { atm: 'AT&M', porto: 'Porto Seguro (AverbePorto)' };
const URL_ATM = { 1: 'https://webserver.averba.com.br/20/index.soap', 2: 'https://homologaws.averba.com.br/20/index.soap' };
const URL_PORTO = 'https://apis.averbeporto.com.br/php/conn.php';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (xml, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}[^>]*>([^<]*)</(?:\\w+:)?${nome}>`, 'i').exec(xml || ''); return m ? m[1].trim() : null; };

function requisicao(url, { metodo = 'POST', cabecalhos = {}, corpo = '', timeout = 45000 } = {}) {
  const alvo = new URL(url);
  const lib = alvo.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(alvo, { method: metodo, headers: { 'Content-Length': Buffer.byteLength(corpo), ...cabecalhos }, timeout }, (res) => {
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => resolve({ status: res.statusCode, cabecalhos: res.headers, texto: Buffer.concat(partes).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('A averbadora não respondeu a tempo. Tente de novo em alguns minutos.')));
    req.on('error', (e) => reject(new Error(/ENOTFOUND|EAI_AGAIN/.test(e.code || '') ? 'Sem acesso ao endereço da averbadora — confira a internet deste servidor.' : `Falha ao falar com a averbadora: ${e.message}`)));
    req.end(corpo);
  });
}

// ---------- AT&M ----------
// Lê o retorno nos dois formatos que a AT&M usa (Response/Averbado e o antigo MSGS/AVERBADO).
function lerRetornoAtm(xml) {
  const falha = tag(xml, 'faultstring');
  if (falha) return { ok: false, mensagem: `AT&M recusou a mensagem: ${falha}` };
  const erros = [...String(xml).matchAll(/<(?:Erro|ERRODETALHE)>([\s\S]*?)<\/(?:Erro|ERRODETALHE)>/gi)]
    .map((m) => `${tag(m[1], 'Codigo') || ''} - ${tag(m[1], 'Descricao') || tag(m[1], 'VALORESPERADO') || ''}`.trim());
  const infos = [...String(xml).matchAll(/<Info>([\s\S]*?)<\/Info>/gi)].map((m) => `${tag(m[1], 'Codigo')} - ${tag(m[1], 'Descricao')}`);
  // Protocolo: <Protocolo>texto</Protocolo> (formato novo) ou <PROTOCOLONUMERO> (antigo).
  const protocolo = tag(xml, 'PROTOCOLONUMERO') || tag(xml, 'Protocolo');
  const numero = tag(xml, 'NumeroAverbacao');
  const teste = /<TESTE>/i.test(xml) || protocolo === 'TESTE';
  const cancelado = /Cancelamento Registrado|Cancelad/i.test(xml);
  if (protocolo && !erros.length) {
    return { ok: true, protocolo, numero: numero || protocolo, teste, cancelado, mensagem: [cancelado ? 'Cancelamento registrado' : teste ? 'Averbação de TESTE (CT-e de homologação)' : 'Averbado', ...infos].join(' · '), dhAverbacao: tag(xml, 'dhAverbacao') };
  }
  // Códigos que o manual manda reenviar depois (erro da AT&M, não do documento).
  const tentarDeNovo = erros.some((e) => /^(000|002|907|910)\b/.test(e));
  return { ok: false, mensagem: erros.join(' | ') || 'A AT&M não devolveu protocolo.', tentarDeNovo };
}

// config.url: só para testes (servidor falso).
async function enviarAtm(config, tipo, xml) {
  const { usuario, senha, codigo, ambiente } = config;
  if (!usuario || !senha || !codigo) throw new Error('Preencha usuário, senha e código AT&M na Configuração fiscal → Averbação.');
  const [metodo, campo] = tipo === 'mdfe' ? ['declaraMDFe', 'xmlMDFe'] : ['averbaCTe', 'xmlCTe'];
  const corpo = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ATMWebSvr">'
    + `<soapenv:Body><urn:${metodo}><usuario>${esc(usuario)}</usuario><senha>${esc(senha)}</senha><codatm>${esc(codigo)}</codatm>`
    + `<${campo}><![CDATA[${String(xml).replace(/^<\?xml[^>]*\?>/, '').replace(/]]>/g, ']]]]><![CDATA[>')}]]></${campo}></urn:${metodo}></soapenv:Body></soapenv:Envelope>`;
  const url = config.url || URL_ATM[Number(ambiente) === 1 ? 1 : 2];
  const r = await requisicao(url, { cabecalhos: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:ATMWebSvr#${metodo}` }, corpo });
  if (r.status >= 400 && !/<(?:\w+:)?Body/i.test(r.texto)) throw new Error(`A AT&M respondeu com erro HTTP ${r.status}.`);
  return { ...lerRetornoAtm(r.texto), retorno: r.texto };
}

// ---------- Porto Seguro (AverbePorto) ----------
function multipart(campos, arquivo) {
  const limite = `----nexofrete${crypto.randomBytes(8).toString('hex')}`;
  const partes = Object.entries(campos).map(([k, v]) => `--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  if (arquivo) partes.push(`--${limite}\r\nContent-Disposition: form-data; name="file"; filename="${arquivo.nome}"\r\nContent-Type: text/xml\r\n\r\n${arquivo.conteudo}\r\n`);
  partes.push(`--${limite}--\r\n`);
  return { corpo: partes.join(''), tipo: `multipart/form-data; boundary=${limite}` };
}
function lerRetornoPorto(texto) {
  let j;
  try { j = JSON.parse(texto); } catch { return { ok: false, mensagem: 'A AverbePorto devolveu uma resposta que não entendi.' }; }
  const s = j.S || {};
  if (j.logout) return { ok: false, mensagem: 'Usuário ou senha da AverbePorto recusados.' };
  if (Number(s.P) > 0 || Number(s.D) > 0) {
    return { ok: true, protocolo: String(j.prot || ''), numero: String(j.prot || ''), mensagem: Number(s.D) > 0 ? 'Documento já averbado (duplicado)' : 'Averbado' };
  }
  if (Number(s.R) > 0) return { ok: false, mensagem: 'A AverbePorto rejeitou o XML (não parece ser do tipo certo).' };
  if (Number(s.N) > 0) return { ok: false, mensagem: 'A AverbePorto não reconheceu o arquivo como XML.' };
  return { ok: false, mensagem: j.error || j.msg || 'A AverbePorto não devolveu o número de averbação.', tentarDeNovo: true };
}
async function enviarPorto(config, tipo, xml, nomeArquivo) {
  const { usuario, senha } = config;
  const URL = config.url || URL_PORTO;
  if (!usuario || !senha) throw new Error('Preencha usuário e senha da AverbePorto na Configuração fiscal → Averbação.');
  const login = multipart({ mod: 'login', comp: '5', user: usuario, pass: senha });
  const r1 = await requisicao(URL, { cabecalhos: { 'Content-Type': login.tipo }, corpo: login.corpo });
  let j1 = {};
  try { j1 = JSON.parse(r1.texto); } catch { /* resposta vazia */ }
  if (!j1.success || !j1.C) throw new Error('Usuário ou senha da AverbePorto recusados.');
  const cookie = (r1.cabecalhos['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const envio = multipart({ comp: '5', mod: 'Upload', path: 'eguarda/php/', recipient: '' }, { nome: nomeArquivo, conteudo: String(xml) });
  const r2 = await requisicao(URL, { cabecalhos: { 'Content-Type': envio.tipo, Cookie: cookie }, corpo: envio.corpo });
  return { ...lerRetornoPorto(r2.texto), retorno: r2.texto };
}

// ---------- Simulação (modo demonstração) ----------
function simular(tipo, xml, cancelamento) {
  const chave = (/(?:Id="(?:CTe|MDFe)|<ch(?:CTe|MDFe)>)(\w{44})/.exec(xml) || [])[1] || '0'.repeat(44);
  const protocolo = `DEMO${crypto.createHash('sha1').update(chave).digest('hex').slice(0, 25).toUpperCase()}`;
  return {
    ok: true, protocolo, numero: `${chave.slice(0, 2)}${chave.slice(6, 20)}${chave.slice(22, 34)}${chave.slice(-4)}`.slice(0, 40), teste: true, cancelado: cancelamento,
    mensagem: cancelamento ? 'Cancelamento registrado (DEMONSTRAÇÃO — nada foi enviado)' : `${tipo === 'mdfe' ? 'Declarado' : 'Averbado'} (DEMONSTRAÇÃO — nada foi enviado à averbadora)`,
  };
}

// config: { provedor, usuario, senha, codigo, ambiente, simulado }; tipo: 'cte' | 'mdfe'.
async function enviar(config, tipo, xml, { nomeArquivo = 'documento.xml', cancelamento = false } = {}) {
  if (config.simulado) return simular(tipo, xml, cancelamento);
  if (config.provedor === 'atm') return enviarAtm(config, tipo, xml);
  if (config.provedor === 'porto') return enviarPorto(config, tipo, xml, nomeArquivo);
  throw new Error('Escolha a averbadora na Configuração fiscal → Averbação.');
}

module.exports = { enviar, lerRetornoAtm, lerRetornoPorto, PROVEDORES, URL_ATM, URL_PORTO };
