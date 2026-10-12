// Modo demonstração da emissão de CT-e: responde no lugar da SEFAZ, aqui
// dentro do servidor, sem internet e sem certificado ICP-Brasil. Serve para
// mostrar e treinar o fluxo inteiro (montar, assinar, transmitir, DACTE,
// cancelar, carta de correção). Nada é enviado a lugar nenhum e nada tem
// valor fiscal.
//
// Mesmo simulado, confere o que dá para conferir sem a SEFAZ: a assinatura
// digital, o ambiente (só homologação) e a chave de acesso.
const zlib = require('zlib');
const { conferir } = require('./assinatura');
const { NS, VERSAO, digitoVerificador } = require('./montarCte');

const autorizadas = new Map();   // chave → nProt (some quando o servidor reinicia; a consulta usa o que está no banco)
const agora = () => {
  const d = new Date(Date.now() - 3 * 3600000);
  return `${d.toISOString().slice(0, 19)}-03:00`;
};
const protocolo = () => `9${String(Date.now()).slice(-14).padStart(14, '0')}`;
const corpo = (xml) => `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${xml}</soap12:Body></soap12:Envelope>`;
const tag = (xml, nome) => (new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml) || [])[1] || null;

function prot(chave, cStat, xMotivo, nProt) {
  return `<protCTe versao="${VERSAO}"><infProt><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><chCTe>${chave}</chCTe>`
    + `<dhRecbto>${agora()}</dhRecbto>${nProt ? `<nProt>${nProt}</nProt>` : ''}<digVal>DEMONSTRACAO</digVal><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt></protCTe>`;
}

// O que a SEFAZ conferiria primeiro. Devolve [cStat, xMotivo] da rejeição, ou null.
function validarCte(xml, chave) {
  if (tag(xml, 'tpAmb') !== '2') return ['252', 'Rejeicao: Ambiente informado diverge do Ambiente de recebimento (demonstracao so aceita homologacao)'];
  if (!/^\d{44}$/.test(chave || '')) return ['236', 'Rejeicao: Chave de Acesso com digito verificador invalido'];
  if (String(digitoVerificador(chave.slice(0, 43))) !== chave[43]) return ['236', 'Rejeicao: Chave de Acesso com digito verificador invalido'];
  const cert = (/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(xml) || [])[1];
  if (!cert) return ['290', 'Rejeicao: Certificado Assinatura invalido'];
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  let ok = false;
  try { ok = conferir(xml, pem); } catch { ok = false; }
  if (!ok) return ['297', 'Rejeicao: Assinatura difere do calculado'];
  const tpEmis = tag(xml, 'tpEmis');
  if (tpEmis !== chave[34]) return ['236', 'Rejeicao: Chave de Acesso invalida (tipo de emissao diverge)'];
  if (tag(xml, 'tpCTe') === '3' && tpEmis !== '1') return ['503', 'Rejeicao: CTe substituto deve ter tipo de emissao = normal'];
  if (tag(xml, 'tpCTe') === '1' && !/<infCteComp>/.test(xml)) return ['505', 'Rejeicao: Grupo CTe complementado nao informado'];
  const cnpjEmit = (/<emit>\s*<CNPJ>(\d{14})<\/CNPJ>/.exec(xml) || [])[1];
  if (cnpjEmit && chave.slice(6, 20) !== cnpjEmit) return ['234', 'Rejeicao: CNPJ do emitente difere do CNPJ da chave de acesso'];
  return null;
}

// servico: recepcao | consulta | status | evento. dados: o conteúdo de cteDadosMsg.
// conhecido: { chave, nProt, cancelado } do banco (para a consulta depois de reiniciar).
function responder(servico, dados, { uf, conhecido } = {}) {
  if (servico === 'status') {
    return corpo(`<retConsStatServCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>107</cStat>`
      + `<xMotivo>Servico em Operacao (DEMONSTRACAO - simulado pelo Nexofrete, nada foi enviado a SEFAZ)</xMotivo><cUF>${uf || ''}</cUF><tMed>1</tMed></retConsStatServCTe>`);
  }
  if (servico === 'recepcao') {
    const xml = zlib.gunzipSync(Buffer.from(dados, 'base64')).toString('utf8');
    const chave = (/Id="CTe(\d{44})"/.exec(xml) || [])[1];
    const erro = validarCte(xml, chave);
    let p;
    if (erro) p = prot(chave || '', erro[0], erro[1]);
    else if (autorizadas.has(chave)) p = prot(chave, '204', 'Rejeicao: Duplicidade de CT-e');
    else {
      const nProt = protocolo();
      autorizadas.set(chave, nProt);
      p = prot(chave, '100', 'Autorizado o uso do CT-e (DEMONSTRACAO - sem valor fiscal)', nProt);
    }
    return corpo(`<retCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>${erro ? erro[0] : '100'}</cStat><xMotivo>Processado</xMotivo>${p}</retCTe>`);
  }
  if (servico === 'consulta') {
    const chave = tag(dados, 'chCTe');
    const nProt = autorizadas.get(chave) || (conhecido?.chave === chave ? conhecido.nProt : null);
    if (!nProt) {
      return corpo(`<retConsSitCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>217</cStat><xMotivo>Rejeicao: CT-e nao consta na base de dados da SEFAZ</xMotivo></retConsSitCTe>`);
    }
    const [cStat, motivo] = conhecido?.cancelado ? ['101', 'Cancelamento de CT-e homologado'] : ['100', 'Autorizado o uso do CT-e'];
    return corpo(`<retConsSitCTe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>${cStat}</cStat><xMotivo>${motivo} (DEMONSTRACAO)</xMotivo>${prot(chave, '100', 'Autorizado o uso do CT-e', nProt)}</retConsSitCTe>`);
  }
  if (servico === 'evento') {
    const tp = tag(dados, 'tpEvento');
    const chave = tag(dados, 'chCTe');
    const cert = (/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(dados) || [])[1];
    let ok = false;
    try { ok = !!cert && conferir(dados, `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`); } catch { ok = false; }
    const [cStat, motivo] = ok ? ['135', 'Evento registrado e vinculado a CT-e (DEMONSTRACAO)'] : ['297', 'Rejeicao: Assinatura difere do calculado'];
    return corpo(`<retEventoCTe xmlns="${NS}" versao="${VERSAO}"><infEvento><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cOrgao>${uf || ''}</cOrgao>`
      + `<cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo><chCTe>${chave}</chCTe><tpEvento>${tp}</tpEvento><dhRegEvento>${agora()}</dhRegEvento>${ok ? `<nProt>${protocolo()}</nProt>` : ''}</infEvento></retEventoCTe>`);
  }
  throw new Error(`Serviço desconhecido: ${servico}`);
}

module.exports = { responder, validarCte };
