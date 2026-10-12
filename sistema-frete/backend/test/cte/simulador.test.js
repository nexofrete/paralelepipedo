const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { dadosDeExemplo } = require('./apoio');
const { montarCte } = require('../../src/cte/montarCte');
const { assinar } = require('../../src/cte/assinatura');
const { lerPfx, gerarCertificadoDemonstracao } = require('../../src/cte/certificado');
const { responder } = require('../../src/cte/simulador');

const { pfx, senha } = gerarCertificadoDemonstracao({ razaoSocial: 'TRANSPORTES TESTE LTDA', cnpj: '11222333000181' });
const cert = lerPfx(pfx, senha);
const enviar = (xml) => responder('recepcao', zlib.gzipSync(Buffer.from(xml)).toString('base64'), { uf: '35' });
const cStatProt = (r) => /<protCTe[\s\S]*<cStat>(\d+)<\/cStat>/.exec(r)[1];

test('certificado de demonstração tem o CNPJ da empresa no titular', () => {
  assert.strictEqual(cert.cnpj, '11222333000181');
});

test('demonstração autoriza CT-e assinado e acusa duplicidade no reenvio', () => {
  const { xml } = montarCte(dadosDeExemplo({ numero: 501 }));
  const assinado = assinar(xml, 'infCte', cert);
  assert.strictEqual(cStatProt(enviar(assinado)), '100');
  assert.strictEqual(cStatProt(enviar(assinado)), '204');
});

test('demonstração rejeita assinatura que não confere (XML alterado depois de assinar)', () => {
  const { xml } = montarCte(dadosDeExemplo({ numero: 502 }));
  const adulterado = assinar(xml, 'infCte', cert).replace('<vTPrest>350.50</vTPrest>', '<vTPrest>999.00</vTPrest>');
  assert.strictEqual(cStatProt(enviar(adulterado)), '297');
});

test('demonstração só aceita homologação', () => {
  const { xml } = montarCte(dadosDeExemplo({ numero: 503, ambiente: 1 }));
  assert.strictEqual(cStatProt(enviar(assinar(xml, 'infCte', cert))), '252');
});
