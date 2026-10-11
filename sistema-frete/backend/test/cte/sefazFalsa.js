// SEFAZ de mentira para os testes: um servidor HTTPS que responde como os
// webservices do CT-e 4.00 (status, autorização síncrona, consulta, evento).
// Também confere que a conexão veio com o certificado do cliente.
const https = require('https');
const zlib = require('zlib');
const forge = require('node-forge');
const ufs = require('../../src/cte/ufs');

function certificadoServidor() {
  const k = forge.pki.rsa.generateKeyPair(2048);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = '02';
  c.validity.notBefore = new Date(Date.now() - 86400000); c.validity.notAfter = new Date(Date.now() + 86400000);
  c.setSubject([{ name: 'commonName', value: 'localhost' }]); c.setIssuer([{ name: 'commonName', value: 'localhost' }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(k.privateKey), cert: forge.pki.certificateToPem(c) };
}

const NS = 'http://www.portalfiscal.inf.br/cte';
const envelope = (corpo) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>${corpo}</soap:Body></soap:Envelope>`;

// comportamento: { autorizacao: '100' | '<cStat de rejeição>' | 'sem-resposta', consulta: '100' | '217' }
function iniciar(comportamento = {}) {
  const recebidos = [];
  const autorizadas = new Map();
  const srv = https.createServer({ ...certificadoServidor(), requestCert: true, rejectUnauthorized: false }, (req, res) => {
    let corpo = '';
    req.on('data', (p) => { corpo += p; });
    req.on('end', () => {
      const cn = req.socket.getPeerCertificate()?.subject?.CN || null;
      const acao = /action="([^"]+)"/.exec(req.headers['content-type'] || '')?.[1] || '';
      const item = { url: req.url, acao, certificadoCliente: cn, corpo };
      recebidos.push(item);
      const responder = (xml) => { res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' }); res.end(envelope(xml)); };
      if (/CTeStatusServicoV4/.test(req.url)) {
        return responder(`<cteStatusServicoCTResult><retConsStatServCTe xmlns="${NS}" versao="4.00"><tpAmb>2</tpAmb><verAplic>TESTE</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF><tMed>1</tMed></retConsStatServCTe></cteStatusServicoCTResult>`);
      }
      if (/CTeRecepcaoSincV4/.test(req.url)) {
        const dados = /<cteDadosMsg[^>]*>([^<]+)<\/cteDadosMsg>/.exec(corpo)?.[1];
        const xml = zlib.gunzipSync(Buffer.from(dados, 'base64')).toString('utf8');
        item.cte = xml;
        const chave = /Id="CTe(\w{44})"/.exec(xml)[1];
        const cStat = comportamento.autorizacao || '100';
        if (cStat === 'sem-resposta') { autorizadas.set(chave, '135260000000099'); req.socket.destroy(); return null; }
        if (cStat === '100') autorizadas.set(chave, '135260000000001');
        const prot = `<protCTe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>TESTE</verAplic><chCTe>${chave}</chCTe><dhRecbto>2026-10-10T10:00:00-03:00</dhRecbto>${cStat === '100' ? '<nProt>135260000000001</nProt>' : ''}<digVal>x</digVal><cStat>${cStat}</cStat><xMotivo>${cStat === '100' ? 'Autorizado o uso do CT-e' : 'Rejeicao: teste'}</xMotivo></infProt></protCTe>`;
        return responder(`<cteRecepcaoResult><retCTe xmlns="${NS}" versao="4.00"><tpAmb>2</tpAmb><cUF>35</cUF><verAplic>TESTE</verAplic><cStat>${cStat === '100' ? '100' : cStat}</cStat><xMotivo>ok</xMotivo>${prot}</retCTe></cteRecepcaoResult>`);
      }
      if (/CTeConsultaV4/.test(req.url)) {
        const chave = /<chCTe>(\w{44})<\/chCTe>/.exec(corpo)?.[1];
        const nProt = autorizadas.get(chave);
        if (!nProt) return responder(`<cteConsultaCTResult><retConsSitCTe xmlns="${NS}" versao="4.00"><tpAmb>2</tpAmb><verAplic>T</verAplic><cStat>217</cStat><xMotivo>Rejeicao: CT-e nao consta na base de dados da SEFAZ</xMotivo><cUF>35</cUF></retConsSitCTe></cteConsultaCTResult>`);
        return responder(`<cteConsultaCTResult><retConsSitCTe xmlns="${NS}" versao="4.00"><tpAmb>2</tpAmb><verAplic>T</verAplic><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo><cUF>35</cUF><protCTe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>T</verAplic><chCTe>${chave}</chCTe><dhRecbto>2026-10-10T10:00:00-03:00</dhRecbto><nProt>${nProt}</nProt><digVal>x</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></retConsSitCTe></cteConsultaCTResult>`);
      }
      if (/CTeRecepcaoEventoV4/.test(req.url)) {
        const tp = /<tpEvento>(\d+)<\/tpEvento>/.exec(corpo)?.[1];
        return responder(`<cteRecepcaoEventoResult><retEventoCTe xmlns="${NS}" versao="4.00"><infEvento><tpAmb>2</tpAmb><verAplic>T</verAplic><cOrgao>35</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a CT-e</xMotivo><tpEvento>${tp}</tpEvento><dhRegEvento>2026-10-10T11:00:00-03:00</dhRegEvento><nProt>135260000000777</nProt></infEvento></retEventoCTe></cteRecepcaoEventoResult>`);
      }
      res.writeHead(404); res.end();
      return null;
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => {
    const base = `https://127.0.0.1:${srv.address().port}`;
    const original = ufs.webservicesDaUf;
    ufs.webservicesDaUf = (uf, tpAmb) => ({
      ...original(uf, tpAmb),
      recepcao: `${base}/CTeRecepcaoSincV4`, consulta: `${base}/CTeConsultaV4`, status: `${base}/CTeStatusServicoV4`, evento: `${base}/CTeRecepcaoEventoV4`,
    });
    resolve({ base, recebidos, comportamento, fechar: () => { ufs.webservicesDaUf = original; return new Promise((r) => srv.close(r)); } });
  }));
}

module.exports = { iniciar };
