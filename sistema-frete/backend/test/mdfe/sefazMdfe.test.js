const test = require('node:test');
const assert = require('node:assert');
const https = require('https');
const zlib = require('zlib');
const forge = require('node-forge');
const { pfxDeTeste } = require('../cte/apoio');
const { lerPfx } = require('../../src/cte/certificado');
const { assinar } = require('../../src/cte/assinatura');
const mdfe = require('../../src/mdfe/montarMdfe');
const sefaz = require('../../src/mdfe/sefazMdfe');

function certServidor() {
  const k = forge.pki.rsa.generateKeyPair(2048); const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = '03';
  c.validity.notBefore = new Date(Date.now() - 864e5); c.validity.notAfter = new Date(Date.now() + 864e5);
  c.setSubject([{ name: 'commonName', value: 'localhost' }]); c.setIssuer([{ name: 'commonName', value: 'localhost' }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(k.privateKey), cert: forge.pki.certificateToPem(c) };
}

test('autorização do MDF-e: SOAP 1.2, cabeçalho mdfeCabecMsg, ação e MDF-e compactado (gzip+base64)', async () => {
  const pfx = pfxDeTeste('1234', '11222333000181');
  const cert = { ...lerPfx(pfx, '1234'), pfx, senha: '1234' };
  let recebido = null;
  const srv = https.createServer({ ...certServidor(), requestCert: true, rejectUnauthorized: false }, (req, res) => {
    let corpo = ''; req.on('data', (p) => { corpo += p; });
    req.on('end', () => {
      recebido = { url: req.url, tipo: req.headers['content-type'], corpo, cliente: req.socket.getPeerCertificate()?.subject?.CN };
      const chave = /Id="MDFe(\d{44})"/.exec(zlib.gunzipSync(Buffer.from(/<mdfeDadosMsg[^>]*>([^<]+)</.exec(corpo)[1], 'base64')).toString())[1];
      res.writeHead(200, { 'Content-Type': 'application/soap+xml' });
      res.end(`<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><mdfeRecepcaoResult><retMDFe xmlns="${mdfe.NS}" versao="3.00"><cStat>100</cStat><xMotivo>ok</xMotivo>`
        + `<protMDFe versao="3.00"><infProt><chMDFe>${chave}</chMDFe><dhRecbto>2026-10-12T10:00:00-03:00</dhRecbto><nProt>935260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo></infProt></protMDFe></retMDFe></mdfeRecepcaoResult></soap:Body></soap:Envelope>`);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const original = sefaz.enderecos.webservice;
  sefaz.enderecos.webservice = (servico) => `https://127.0.0.1:${srv.address().port}/ws/${sefaz.SERVICOS[servico].operacao}/${sefaz.SERVICOS[servico].operacao}.asmx`;
  try {
    const { xml, chave } = mdfe.montarMdfe({
      ambiente: 2, serie: 1, numero: 7,
      emitente: { cnpj: '11222333000181', ie: '123456789012', xNome: 'TRANSPORTES TESTE', rntrc: '12345678', endereco: { xLgr: 'RUA A', nro: '1', xBairro: 'CENTRO', cMun: '3509502', xMun: 'CAMPINAS', UF: 'SP' } },
      ufIni: 'SP', ufFim: 'SP', carregamento: [{ cMun: '3509502', xMun: 'CAMPINAS' }],
      descargas: [{ cMun: '3550308', xMun: 'SAO PAULO', ctes: ['35261011222333000181570010000001231000001234'] }],
      veiculo: { placa: 'ABC1D23', tara: 5000, tpRod: '02', tpCar: '02', uf: 'SP' }, condutores: [{ xNome: 'JOSE', cpf: '12345678909' }],
      prodPred: { xProd: 'DIVERSOS' }, tot: { vCarga: 1000, qCarga: 100 },
    });
    const r = await sefaz.autorizar({ ufEmit: 'SP', tpAmb: 2, cert, xmlAssinado: mdfe.incluirQrCode(assinar(xml, 'infMDFe', cert), chave, 2) });
    assert.strictEqual(r.cStat, '100'); assert.strictEqual(r.nProt, '935260000000001');
    assert.strictEqual(recebido.url, '/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx');
    assert.match(recebido.tipo, /application\/soap\+xml; charset=utf-8; action="http:\/\/www\.portalfiscal\.inf\.br\/mdfe\/wsdl\/MDFeRecepcaoSinc\/mdfeRecepcao"/);
    assert.match(recebido.corpo, /<mdfeCabecMsg xmlns="http:\/\/www\.portalfiscal\.inf\.br\/mdfe\/wsdl\/MDFeRecepcaoSinc"><cUF>35<\/cUF><versaoDados>3\.00<\/versaoDados><\/mdfeCabecMsg>/);
    assert.match(recebido.cliente, /TESTE/);   // o certificado A1 foi na conexão
  } finally { sefaz.enderecos.webservice = original; srv.close(); }
});

test('endereços da SVRS (homologação e produção)', () => {
  assert.strictEqual(sefaz.enderecos.webservice('evento', 2), 'https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx');
  assert.strictEqual(sefaz.enderecos.webservice('naoEncerrados', 1), 'https://mdfe.svrs.rs.gov.br/ws/MDFeConsNaoEnc/MDFeConsNaoEnc.asmx');
});
