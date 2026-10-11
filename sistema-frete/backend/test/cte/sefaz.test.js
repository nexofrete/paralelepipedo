// Comunicação com a SEFAZ, contra um servidor que imita os webservices.
const test = require('node:test');
const assert = require('node:assert');
const sefaz = require('../../src/cte/sefaz');
const { lerPfx } = require('../../src/cte/certificado');
const { montarCte } = require('../../src/cte/montarCte');
const { assinar } = require('../../src/cte/assinatura');
const { cancelamento } = require('../../src/cte/eventos');
const { pfxDeTeste, dadosDeExemplo } = require('./apoio');
const falsa = require('./sefazFalsa');

const pfx = pfxDeTeste('1234');
const cert = { ...lerPfx(pfx, '1234'), pfx, senha: '1234' };

test('status, autorização, consulta e evento conversam no formato SOAP 1.2 com o certificado', async () => {
  const s = await falsa.iniciar();
  try {
    const st = await sefaz.statusServico({ uf: 'SP', tpAmb: 2, cert });
    assert.strictEqual(st.cStat, '107');
    assert.match(s.recebidos[0].acao, /wsdl\/CTeStatusServicoV4\/cteStatusServicoCT$/);
    assert.match(s.recebidos[0].certificadoCliente, /TRANSPORTES TESTE LTDA/);

    const { xml, chave } = montarCte(dadosDeExemplo());
    const r = await sefaz.autorizar({ uf: 'SP', tpAmb: 2, cert, xmlAssinado: assinar(xml, 'infCte', cert) });
    assert.strictEqual(r.cStat, '100');
    assert.strictEqual(r.nProt, '135260000000001');
    assert.match(r.protCTe, /^<protCTe/);
    // Foi compactado (gzip + base64) e chegou inteiro e assinado.
    assert.match(s.recebidos[1].cte, /<Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    assert.ok(s.recebidos[1].corpo.includes('<soap12:Header><cteCabecMsg'));

    const c = await sefaz.consultar({ uf: 'SP', tpAmb: 2, cert, chave });
    assert.strictEqual(c.cStat, '100');
    assert.strictEqual(c.nProt, '135260000000001');

    const ev = assinar(cancelamento({ chave, cnpj: '11222333000181', uf: 'SP', tpAmb: 2, nProt: r.nProt, justificativa: 'Cancelamento de teste automatico' }), 'infEvento', cert);
    const re = await sefaz.enviarEvento({ uf: 'SP', tpAmb: 2, cert, xmlEventoAssinado: ev });
    assert.strictEqual(re.cStat, '135');
    assert.strictEqual(re.nProt, '135260000000777');
  } finally {
    await s.fechar();
  }
});

test('servidor da SEFAZ com certificado não reconhecido: erro claro quando a verificação está ligada', async () => {
  const s = await falsa.iniciar();
  try {
    await assert.rejects(sefaz.statusServico({ uf: 'SP', tpAmb: 2, cert, verificarServidor: true }), /certificado do servidor da SEFAZ/);
  } finally {
    await s.fechar();
  }
});
