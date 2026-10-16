// Comunicação com a Sefin Nacional (API REST do Sistema Nacional da NFS-e),
// com o certificado A1 da empresa na conexão (mTLS). Os XML vão e voltam
// compactados (gzip) em base64 dentro de um JSON.
//   POST /nfse                      → envia a DPS, recebe a NFS-e
//   GET  /dps/{idDps}               → a DPS já virou NFS-e? (resposta perdida)
//   GET  /nfse/{chave}              → XML da NFS-e
//   POST /nfse/{chave}/eventos      → cancelamento
// No modo demonstração, quem responde é o simulador daqui de dentro.
const https = require('https');
const zlib = require('zlib');
const { lerNfse, dvChave, tag, so, NS, VERSAO, dataHoraBr } = require('./montarNfse');

const BASE = {
  1: 'https://sefin.nfse.gov.br/SefinNacional',
  2: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
};
const gz = (xml) => zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
// Limites: resposta e XML descompactado de no máximo 20 MB (resposta maliciosa ou com defeito não derruba o servidor).
const LIMITE = 20 * 1024 * 1024;
const gunz = (b64) => zlib.gunzipSync(Buffer.from(String(b64), 'base64'), { maxOutputLength: LIMITE }).toString('utf8');
// Chave de acesso da NFS-e: 50 dígitos (vai no endereço da API).
const chaveOk = (c) => (/^\d{50}$/.test(String(c || '')) ? String(c) : null);

function pedir(metodo, url, corpo, cert, { verificarServidor = true, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = https.request(url, {
      method: metodo,
      agent: new https.Agent({ pfx: cert.pfx, passphrase: cert.senha, minVersion: 'TLSv1.2', rejectUnauthorized: !!verificarServidor, keepAlive: false }),
      headers: { Accept: 'application/json', ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {}) },
      timeout,
    }, (res) => {
      const partes = []; let tam = 0;
      res.on('data', (p) => { tam += p.length; if (tam > LIMITE) { req.destroy(new Error('resposta grande demais')); return; } partes.push(p); });
      res.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8');
        let json = null;
        try { json = texto ? JSON.parse(texto) : {}; } catch { json = null; }
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('O Sistema Nacional da NFS-e recusou o certificado (confira se é o A1 da empresa e se o município aderiu ao emissor nacional).'));
        if (!json) return reject(new Error(`Resposta inesperada do Sistema Nacional (HTTP ${res.statusCode}).`));
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('O Sistema Nacional da NFS-e não respondeu a tempo. Tente de novo em alguns minutos.')));
    req.on('error', (e) => reject(new Error(/ENOTFOUND|EAI_AGAIN/.test(e.code || '') ? 'Sem acesso ao Sistema Nacional da NFS-e — confira a internet deste servidor.'
      : /certificate|self.signed|unable to verify/i.test(e.message) ? `Não consegui conferir o certificado do servidor do Sistema Nacional (${e.message}). Desligue "Verificar o certificado da SEFAZ" na Configuração fiscal ou instale as raízes ICP-Brasil.`
        : `Falha na comunicação com o Sistema Nacional da NFS-e: ${e.message}`)));
    req.end(dados || undefined);
  });
}

// Lista de erros do retorno → texto.
const errosDe = (j) => (j?.erros || j?.Erros || []).map((e) => ({ codigo: e.Codigo || e.codigo || '', descricao: e.Descricao || e.descricao || '', complemento: e.Complemento || e.complemento || '' }));

// Resultado: { ok, chave, xmlNfse, erros, alertas }
async function enviarDps({ tpAmb, cert, xmlAssinado, verificarServidor, simulado }) {
  if (simulado) return require('./simuladorNfse').enviarDps(xmlAssinado, simulado);
  const { status, json } = await pedir('POST', `${BASE[tpAmb]}/nfse`, { dpsXmlGZipB64: gz(xmlAssinado) }, cert, { verificarServidor });
  if (status < 300 && json.nfseXmlGZipB64) return { ok: true, chave: chaveOk(json.chaveAcesso), xmlNfse: gunz(json.nfseXmlGZipB64), alertas: errosDe({ erros: json.alertas }) };
  return { ok: false, erros: errosDe(json).length ? errosDe(json) : [{ codigo: String(status), descricao: json.message || json.mensagem || 'Recusada pelo Sistema Nacional.' }] };
}

// A DPS já foi convertida em NFS-e? Devolve a chave ou null.
async function consultarDps({ tpAmb, cert, idDps, verificarServidor, simulado }) {
  if (simulado) return require('./simuladorNfse').consultarDps(idDps);
  const { status, json } = await pedir('GET', `${BASE[tpAmb]}/dps/${idDps}`, null, cert, { verificarServidor });
  return status < 300 ? chaveOk(json.chaveAcesso) : null;
}

async function baixarNfse({ tpAmb, cert, chave, verificarServidor, simulado }) {
  if (!chaveOk(chave)) throw new Error('Chave da NFS-e inválida.');
  if (simulado) return require('./simuladorNfse').baixarNfse(chave);
  const { status, json } = await pedir('GET', `${BASE[tpAmb]}/nfse/${chave}`, null, cert, { verificarServidor });
  return status < 300 && json.nfseXmlGZipB64 ? gunz(json.nfseXmlGZipB64) : null;
}

async function enviarEvento({ tpAmb, cert, chave, xmlAssinado, verificarServidor, simulado }) {
  if (!chaveOk(chave)) throw new Error('Chave da NFS-e inválida.');
  if (simulado) return require('./simuladorNfse').enviarEvento(chave, xmlAssinado);
  const { status, json } = await pedir('POST', `${BASE[tpAmb]}/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: gz(xmlAssinado) }, cert, { verificarServidor });
  if (status < 300 && json.eventoXmlGZipB64) return { ok: true, xmlEvento: gunz(json.eventoXmlGZipB64) };
  return { ok: false, erros: errosDe(json).length ? errosDe(json) : [{ codigo: String(status), descricao: 'Cancelamento recusado pelo Sistema Nacional.' }] };
}

module.exports = { BASE, chaveOk, enviarDps, consultarDps, baixarNfse, enviarEvento, gz, gunz, errosDe, lerNfse, dvChave, tag, so, NS, VERSAO, dataHoraBr };
