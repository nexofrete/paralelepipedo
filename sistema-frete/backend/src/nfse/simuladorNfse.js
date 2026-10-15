// Modo demonstração da NFS-e: responde no lugar da Sefin Nacional, aqui
// dentro do servidor. Confere o que dá para conferir sem o governo (assinatura,
// ambiente de homologação, identificador da DPS) e devolve uma NFS-e com o ISS
// calculado pela alíquota configurada. Nada é enviado e nada tem valor fiscal.
const crypto = require('crypto');
const { conferir } = require('../cte/assinatura');
const { tag, so, dvChave, idDps, NS, VERSAO, dataHoraBr } = require('./montarNfse');

const emitidas = new Map();   // idDps → { chave, xml }   (some ao reiniciar; o banco guarda o resto)
const porChave = new Map();   // chave → xml
let sequencia = Number(String(Date.now()).slice(-6));

const erro = (codigo, descricao) => ({ ok: false, erros: [{ codigo, descricao, complemento: 'DEMONSTRAÇÃO — simulado pelo Nexofrete' }] });

function assinaturaOk(xml) {
  const cert = (/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(xml) || [])[1];
  if (!cert) return false;
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  try { return conferir(xml, pem); } catch { return false; }
}

// opcoes: { aliquota, municipio }
function enviarDps(xml, opcoes = {}) {
  if (tag(xml, 'tpAmb') !== '2') return erro('E0001', 'Demonstração só aceita o ambiente de homologação (produção restrita).');
  if (!assinaturaOk(xml)) return erro('E0714', 'Assinatura digital da DPS inválida.');
  const id = (/<infDPS Id="(DPS\d{42})"/.exec(xml) || [])[1];
  const cMun = tag(xml, 'cLocEmi'); const cnpj = tag(xml, 'CNPJ', 'prest');
  if (!id || id !== idDps({ cMun, doc: cnpj, serie: tag(xml, 'serie'), numero: tag(xml, 'nDPS') })) return erro('E0004', 'Identificador da DPS não confere com os campos informados.');
  if (emitidas.has(id)) return erro('E0014', 'DPS já convertida em NFS-e (duplicidade).');
  sequencia += 1;
  const agora = dataHoraBr();
  const base = `${so(cMun)}2${'2'}${so(cnpj).padStart(14, '0')}${String(sequencia).padStart(13, '0')}${agora.slice(2, 4)}${agora.slice(5, 7)}${String(crypto.randomInt(1e8, 1e9))}`;
  const chave = `${base}${dvChave(base)}`;
  const vServ = Number(tag(xml, 'vServ')) || 0;
  const desc = Number(tag(xml, 'vDescIncond')) || 0;
  const aliq = Number(tag(xml, 'pAliq')) || Number(opcoes.aliquota) || 5;
  const bc = Math.round((vServ - desc) * 100) / 100;
  const iss = Math.round(bc * aliq) / 100;
  const retido = tag(xml, 'tpRetISSQN') === '2';
  const dps = xml.replace(/^<\?xml[^>]*>/, '').replace(` xmlns="${NS}"`, '');
  const nfse = `<NFSe xmlns="${NS}" versao="${VERSAO}"><infNFSe Id="NFS${chave}"><xLocEmi>${opcoes.municipio || cMun}</xLocEmi><xLocPrestacao>${opcoes.municipio || cMun}</xLocPrestacao>`
    + `<nNFSe>${sequencia}</nNFSe><cLocIncid>${cMun}</cLocIncid><xLocIncid>${opcoes.municipio || cMun}</xLocIncid><xTribNac>Outros serviços de transporte de natureza municipal</xTribNac>`
    + `<verAplic>NEXOFRETE-DEMO</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>${agora}</dhProc><nDFSe>${sequencia}</nDFSe>`
    + `<emit><CNPJ>${cnpj}</CNPJ><xNome>DEMONSTRACAO - SEM VALOR FISCAL</xNome><enderNac><xLgr>-</xLgr><nro>0</nro><xBairro>-</xBairro><cMun>${cMun}</cMun><UF>SP</UF><CEP>00000000</CEP></enderNac></emit>`
    + `<valores><vBC>${bc.toFixed(2)}</vBC><pAliqAplic>${aliq.toFixed(2)}</pAliqAplic><vISSQN>${iss.toFixed(2)}</vISSQN>${retido ? `<vTotalRet>${iss.toFixed(2)}</vTotalRet>` : ''}<vLiq>${(bc - (retido ? iss : 0)).toFixed(2)}</vLiq></valores>`
    + `${dps}</infNFSe></NFSe>`;
  emitidas.set(id, { chave, xml: nfse }); porChave.set(chave, nfse);
  return { ok: true, chave, xmlNfse: nfse, alertas: [] };
}

const consultarDps = (id) => emitidas.get(id)?.chave || null;
const baixarNfse = (chave) => porChave.get(chave) || null;

function enviarEvento(chave, xml) {
  if (!assinaturaOk(xml)) return erro('E1235', 'Assinatura digital do pedido de evento inválida.');
  if (tag(xml, 'chNFSe') !== chave) return erro('E1203', 'Chave da NFS-e do evento difere da chave do endereço.');
  const evento = `<evento xmlns="${NS}" versao="${VERSAO}"><infEvento Id="EVT${chave}101101001"><verAplic>NEXOFRETE-DEMO</verAplic><ambGer>2</ambGer><nSeqEvento>1</nSeqEvento>`
    + `<dhProc>${dataHoraBr()}</dhProc><nDFe>${sequencia}</nDFe>${xml.replace(/^<\?xml[^>]*>/, '')}</infEvento></evento>`;
  return { ok: true, xmlEvento: evento };
}

module.exports = { enviarDps, consultarDps, baixarNfse, enviarEvento };
