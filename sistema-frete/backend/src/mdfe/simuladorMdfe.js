// Modo demonstração do MDF-e: responde no lugar da SEFAZ (SVRS) aqui no
// servidor. Confere a assinatura, a chave e o ambiente; guarda os MDF-e
// autorizados e encerrados enquanto o servidor estiver ligado (depois usa o
// que o banco informar em "conhecido").
const zlib = require('zlib');
const { conferir } = require('../cte/assinatura');
const { digitoVerificador } = require('../cte/montarCte');
const { NS, VERSAO } = require('./montarMdfe');

const autorizados = new Map();   // chave → { nProt, encerrado, cancelado }
const agora = () => `${new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19)}-03:00`;
const protocolo = () => `9${String(Date.now()).slice(-14).padStart(14, '0')}`;
const corpo = (xml) => `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${xml}</soap12:Body></soap12:Envelope>`;
const tag = (xml, nome) => (new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml) || [])[1] || null;
const pem = (b64) => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
function assinaturaOk(xml) {
  const c = (/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(xml) || [])[1];
  try { return !!c && conferir(xml, pem(c)); } catch { return false; }
}

function validar(xml, chave) {
  if (tag(xml, 'tpAmb') !== '2') return ['252', 'Rejeicao: Ambiente informado diverge do Ambiente de recebimento (demonstracao so aceita homologacao)'];
  if (!/^\d{44}$/.test(chave || '') || String(digitoVerificador(chave.slice(0, 43))) !== chave[43]) return ['236', 'Rejeicao: Chave de Acesso com digito verificador invalido'];
  if (!assinaturaOk(xml)) return ['297', 'Rejeicao: Assinatura difere do calculado'];
  // Regra da SEFAZ: não autoriza outro MDF-e para a mesma placa enquanto houver um aberto.
  const placa = (/<veicTracao>[\s\S]*?<placa>([^<]+)<\/placa>/.exec(xml) || [])[1];
  for (const [ch, v] of autorizados) {
    if (ch !== chave && v.placa === placa && !v.encerrado && !v.cancelado) return ['686', `Rejeicao: Existe MDF-e nao encerrado para esta placa (chave ${ch})`];
  }
  return null;
}
const prot = (chave, cStat, xMotivo, nProt) => `<protMDFe versao="${VERSAO}"><infProt><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><chMDFe>${chave}</chMDFe>`
  + `<dhRecbto>${agora()}</dhRecbto>${nProt ? `<nProt>${nProt}</nProt>` : ''}<digVal>DEMONSTRACAO</digVal><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt></protMDFe>`;

function responder(servico, dados, { cUF, conhecido } = {}) {
  if (conhecido?.chave && !autorizados.has(conhecido.chave)) autorizados.set(conhecido.chave, { nProt: conhecido.nProt, encerrado: conhecido.encerrado, cancelado: conhecido.cancelado, placa: conhecido.placa });
  if (servico === 'status') {
    return corpo(`<retConsStatServMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>107</cStat>`
      + `<xMotivo>Servico em Operacao (DEMONSTRACAO - MDF-e simulado pelo Nexofrete, nada foi enviado a SEFAZ)</xMotivo><cUF>${cUF}</cUF><tMed>1</tMed></retConsStatServMDFe>`);
  }
  if (servico === 'recepcao') {
    const xml = zlib.gunzipSync(Buffer.from(dados, 'base64')).toString('utf8');
    const chave = (/Id="MDFe(\d{44})"/.exec(xml) || [])[1];
    const erro = validar(xml, chave);
    let p;
    if (erro) p = prot(chave || '', erro[0], erro[1]);
    else if (autorizados.has(chave)) p = prot(chave, '204', 'Rejeicao: Duplicidade de MDF-e');
    else {
      const nProt = protocolo();
      autorizados.set(chave, { nProt, placa: (/<veicTracao>[\s\S]*?<placa>([^<]+)<\/placa>/.exec(xml) || [])[1] });
      p = prot(chave, '100', 'Autorizado o uso do MDF-e (DEMONSTRACAO - sem valor fiscal)', nProt);
    }
    return corpo(`<retMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><cUF>${cUF}</cUF><verAplic>NEXOFRETE-DEMO</verAplic><cStat>${erro ? erro[0] : '100'}</cStat><xMotivo>Processado</xMotivo>${p}</retMDFe>`);
  }
  if (servico === 'consulta') {
    const chave = tag(dados, 'chMDFe'); const a = autorizados.get(chave);
    if (!a) return corpo(`<retConsSitMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>217</cStat><xMotivo>Rejeicao: MDF-e nao consta na base de dados da SEFAZ</xMotivo><cUF>${cUF}</cUF></retConsSitMDFe>`);
    const [c, m] = a.cancelado ? ['101', 'Cancelamento de MDF-e homologado'] : a.encerrado ? ['132', 'Encerramento de MDF-e homologado'] : ['100', 'Autorizado o uso do MDF-e'];
    return corpo(`<retConsSitMDFe xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cStat>${c}</cStat><xMotivo>${m} (DEMONSTRACAO)</xMotivo><cUF>${cUF}</cUF>${prot(chave, '100', 'Autorizado o uso do MDF-e', a.nProt)}</retConsSitMDFe>`);
  }
  if (servico === 'evento') {
    const chave = tag(dados, 'chMDFe'); const tp = tag(dados, 'tpEvento'); const a = autorizados.get(chave);
    let r = assinaturaOk(dados) ? null : ['297', 'Rejeicao: Assinatura difere do calculado'];
    if (!r && !a) r = ['217', 'Rejeicao: MDF-e nao consta na base de dados da SEFAZ'];
    if (!r && (a.cancelado || a.encerrado) && tp !== '110114') r = ['609', `Rejeicao: MDF-e ja ${a.cancelado ? 'cancelado' : 'encerrado'}`];
    if (!r && tp === '110111') a.cancelado = true;
    if (!r && tp === '110112') a.encerrado = true;
    const [cStat, xMotivo] = r || ['135', 'Evento registrado e vinculado a MDF-e (DEMONSTRACAO)'];
    return corpo(`<retEventoMDFe xmlns="${NS}" versao="${VERSAO}"><infEvento><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic><cOrgao>${cUF}</cOrgao>`
      + `<cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo><chMDFe>${chave}</chMDFe><tpEvento>${tp}</tpEvento><dhRegEvento>${agora()}</dhRegEvento>${r ? '' : `<nProt>${protocolo()}</nProt>`}</infEvento></retEventoMDFe>`);
  }
  if (servico === 'naoEncerrados') {
    const abertos = [...autorizados].filter(([, v]) => !v.encerrado && !v.cancelado);
    return corpo(`<retConsMDFeNaoEnc xmlns="${NS}" versao="${VERSAO}"><tpAmb>2</tpAmb><verAplic>NEXOFRETE-DEMO</verAplic>`
      + `<cStat>${abertos.length ? '111' : '112'}</cStat><xMotivo>${abertos.length ? 'Consulta nao encerrados localizou MDF-e' : 'Consulta nao encerrados nao localizou MDF-e'}</xMotivo><cUF>${cUF}</cUF>`
      + `${abertos.map(([ch, v]) => `<infMDFe><chMDFe>${ch}</chMDFe><nProt>${v.nProt}</nProt></infMDFe>`).join('')}</retConsMDFeNaoEnc>`);
  }
  throw new Error(`Serviço desconhecido: ${servico}`);
}

module.exports = { responder };
