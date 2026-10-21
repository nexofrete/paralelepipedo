// Distribuição DF-e e manifestação: leitura do retorno da SEFAZ e o evento assinado.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const dfe = require('../src/dfe');
const { gerarCertificadoDemonstracao, lerPfx } = require('../src/cte/certificado');
const { assinar, conferir } = require('../src/cte/assinatura');

const CHAVE = '35261044555666000177550010000070011554409190';
const ctx = { cnpj: '11222333000181', uf: 'SP', tpAmb: 1 };

test('DF-e: pedido por NSU e leitura do retorno (docZip em gzip/base64)', () => {
  assert.match(dfe.corpoDist(ctx, '<distNSU><ultNSU>000000000000012</ultNSU></distNSU>'),
    /^<distDFeInt xmlns="http:\/\/www.portalfiscal.inf.br\/nfe" versao="1.01"><tpAmb>1<\/tpAmb><cUFAutor>35<\/cUFAutor><CNPJ>11222333000181<\/CNPJ><distNSU>/);
  const res = `<resNFe><chNFe>${CHAVE}</chNFe><CNPJ>44555666000177</CNPJ><xNome>POSTO</xNome><vNF>100.00</vNF><cSitNFe>1</cSitNFe></resNFe>`;
  const z = zlib.gzipSync(Buffer.from(res)).toString('base64');
  const soap = `<soap:Envelope><soap:Body><nfeDistDFeInteresseResponse><nfeDistDFeInteresseResult><retDistDFeInt versao="1.01"><tpAmb>1</tpAmb><cStat>138</cStat><xMotivo>Documento localizado</xMotivo>
    <ultNSU>000000000000013</ultNSU><maxNSU>000000000000020</maxNSU><loteDistDFeInt><docZip NSU="000000000000013" schema="resNFe_v1.01.xsd">${z}</docZip></loteDistDFeInt></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
  const r = dfe.lerRetornoDist(soap);
  assert.strictEqual(r.cStat, '138');
  assert.strictEqual(r.ultNSU, 13);
  assert.strictEqual(r.maxNSU, 20);
  assert.strictEqual(r.docs.length, 1);
  assert.strictEqual(r.docs[0].schema, 'resNFe_v1.01.xsd');
  assert.match(r.docs[0].xml, new RegExp(CHAVE));
});

test('Manifestação: evento no Ambiente Nacional (cOrgao 91), Id certo e assinatura válida', () => {
  const ev = dfe.montarEvento(ctx, { chave: CHAVE, tipo: 'nao_realizada', justificativa: 'Mercadoria nao foi entregue & devolvida' });
  assert.match(ev, new RegExp(`<infEvento Id="ID210240${CHAVE}01"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>11222333000181</CNPJ>`));
  assert.match(ev, /<tpEvento>210240<\/tpEvento><nSeqEvento>1<\/nSeqEvento><verEvento>1.00<\/verEvento>/);
  assert.match(ev, /<xJust>Mercadoria nao foi entregue &amp; devolvida<\/xJust>/);
  assert.doesNotMatch(dfe.montarEvento(ctx, { chave: CHAVE, tipo: 'ciencia' }), /xJust/);
  const { pfx, senha } = gerarCertificadoDemonstracao({ razaoSocial: 'TESTE', cnpj: ctx.cnpj });
  const cert = lerPfx(pfx, senha);
  const assinado = assinar(ev, 'infEvento', cert);
  assert.match(assinado, new RegExp(`<Reference URI="#ID210240${CHAVE}01">`));
  assert.ok(conferir(assinado, cert.certPem));
});
