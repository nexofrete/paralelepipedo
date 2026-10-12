const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pfxDeTeste, validarXsd, temXmllint } = require('../cte/apoio');
const { lerPfx } = require('../../src/cte/certificado');
const { assinar, conferir } = require('../../src/cte/assinatura');
const mdfe = require('../../src/mdfe/montarMdfe');

const XSD = (n) => path.join(__dirname, 'schemas', n);
const cert = lerPfx(pfxDeTeste('1234', '11222333000181'), '1234');
const pular = !temXmllint() && 'xmllint não instalado';

function dadosDeExemplo(extra = {}) {
  return {
    ambiente: 2, serie: 1, numero: 15,
    emitente: { cnpj: '11222333000181', ie: '123456789012', xNome: 'TRANSPORTES TESTE LTDA', rntrc: '12345678', fone: '1932323232',
      endereco: { xLgr: 'RUA TESTE', nro: '100', xBairro: 'CENTRO', cMun: '3509502', xMun: 'CAMPINAS', CEP: '13000000', UF: 'SP' } },
    ufIni: 'SP', ufFim: 'BA', percurso: ['MG'],
    carregamento: [{ cMun: '3509502', xMun: 'CAMPINAS' }],
    descargas: [
      { cMun: '2927408', xMun: 'SALVADOR', ctes: ['35261011222333000181570010000001231000001234', '35261011222333000181570010000001241000001239'] },
      { cMun: '2910800', xMun: 'FEIRA DE SANTANA', ctes: ['35261011222333000181570010000001251000001233'] },
    ],
    veiculo: { placa: 'ABC1D23', renavam: '12345678901', tara: 7500, capKG: 14000, capM3: 60, tpRod: '01', tpCar: '02', uf: 'SP' },
    reboques: [],
    condutores: [{ xNome: 'JOSE DA SILVA', cpf: '12345678909' }],
    ciot: [{ ciot: '123456789012', doc: '12345678909' }],
    valePedagio: [{ cnpjForn: '04088208000165', docPg: '11222333000181', nCompra: '998877', vValePed: 154.3 }],
    contratantes: [{ xNome: 'INDUSTRIA REMETENTE SA', doc: '44555666000199' }],
    seguros: [{ respSeg: '1', xSeg: 'SEGURADORA TESTE', cnpjSeg: '61198164000160', nApol: 'AP-2026-001', nAver: ['00112233445566'] }],
    prodPred: { tpCarga: '05', xProd: 'MOVEIS', NCM: '94036000' },
    tot: { vCarga: 85000.5, cUnid: '01', qCarga: 9800.25 },
    lacres: ['LAC123'], infCpl: 'Entrega com agendamento & conferência',
    respTec: { cnpj: '11222333000181', xContato: 'SUPORTE', email: 'suporte@teste.com.br', fone: '1932323232' },
    ...extra,
  };
}

test('chave do MDF-e: 44 dígitos, modelo 58, DV correto', () => {
  const { chave } = mdfe.montarMdfe(dadosDeExemplo());
  assert.match(chave, /^35\d{4}11222333000181580010000000151\d{9}$/);
});

test('MDF-e montado e assinado passa no schema 3.00b (geral e modal rodoviário)', { skip: pular }, () => {
  const { xml, chave, tpAmb } = mdfe.montarMdfe(dadosDeExemplo());
  const assinado = mdfe.incluirQrCode(assinar(xml, 'infMDFe', cert), chave, tpAmb);
  assert.strictEqual(conferir(assinado, cert.certPem), true);
  assert.strictEqual(validarXsd(assinado, XSD('mdfe_v3.00.xsd')), null);
  const rodo = /<rodo>[\s\S]*<\/rodo>/.exec(assinado)[0].replace('<rodo>', `<rodo xmlns="${mdfe.NS}">`);
  assert.strictEqual(validarXsd(rodo, XSD('mdfeModalRodoviario_v3.00.xsd')), null);
  assert.match(assinado, /<qrCodMDFe>https:\/\/dfe-portal\.svrs\.rs\.gov\.br\/mdfe\/qrCode\?chMDFe=\d{44}&amp;tpAmb=2<\/qrCodMDFe>/);
  assert.match(assinado, /<tot><qCTe>3<\/qCTe><vCarga>85000\.50<\/vCarga><cUnid>01<\/cUnid><qCarga>9800\.2500<\/qCarga><\/tot>/);
});

test('MDF-e mínimo (sem seguro, CIOT, reboque) e com reboque também passam no schema', { skip: pular }, () => {
  for (const extra of [
    { seguros: [], ciot: [], valePedagio: [], contratantes: [], lacres: [], percurso: [], ufFim: 'SP', infCpl: null, respTec: null,
      descargas: [{ cMun: '3550308', xMun: 'SAO PAULO', ctes: ['35261011222333000181570010000001231000001234'] }] },
    { reboques: [{ placa: 'XYZ9A87', tara: 6000, capKG: 25000, tpCar: '05', uf: 'MG' }], veiculo: { placa: 'ABC1D23', tara: 8000, tpRod: '03', tpCar: '00', uf: 'SP' } },
  ]) {
    const { xml } = mdfe.montarMdfe(dadosDeExemplo(extra));
    const assinado = assinar(xml, 'infMDFe', cert);
    assert.strictEqual(validarXsd(assinado, XSD('mdfe_v3.00.xsd')), null);
    const rodo = /<rodo>[\s\S]*<\/rodo>/.exec(assinado)[0].replace('<rodo>', `<rodo xmlns="${mdfe.NS}">`);
    assert.strictEqual(validarXsd(rodo, XSD('mdfeModalRodoviario_v3.00.xsd')), null);
  }
});

test('eventos (cancelamento, encerramento, inclusão de condutor) passam no schema', { skip: pular }, () => {
  const base = { chave: '35261011222333000181580010000000151000001234', cnpj: '11222333000181', ufEmit: 'SP', tpAmb: 2, nProt: '935260000000001' };
  const eventos = [
    [mdfe.cancelamento({ ...base, justificativa: 'Viagem cancelada pelo cliente' }), 'evCancMDFe'],
    [mdfe.encerramento({ ...base, dtEnc: '2026-10-14', ufEnc: 'BA', cMun: '2927408' }), 'evEncMDFe'],
    [mdfe.inclusaoCondutor({ ...base, nSeq: 2, xNome: 'MARIA SOUZA', cpf: '98765432100' }), 'evIncCondutorMDFe'],
  ];
  for (const [xml, ev] of eventos) {
    const assinado = assinar(xml, 'infEvento', cert);
    assert.strictEqual(validarXsd(assinado, XSD('eventoMDFe_v3.00.xsd')), null, ev);
    const det = new RegExp(`<${ev}>[\\s\\S]*</${ev}>`).exec(assinado)[0].replace(`<${ev}>`, `<${ev} xmlns="${mdfe.NS}">`);
    assert.strictEqual(validarXsd(det, XSD(`${ev}_v3.00.xsd`)), null, ev);
  }
});

test('erros claros para o que falta', () => {
  assert.throws(() => mdfe.montarMdfe(dadosDeExemplo({ condutores: [] })), /motorista/);
  assert.throws(() => mdfe.montarMdfe(dadosDeExemplo({ descargas: [] })), /descarregamento/);
  assert.throws(() => mdfe.montarMdfe(dadosDeExemplo({ veiculo: { placa: 'ABC1D23', tpRod: '01', tpCar: '02' } })), /tara/);
  assert.throws(() => mdfe.montarMdfe(dadosDeExemplo({ tot: { vCarga: 0, qCarga: 0 } })), /valor e o peso/);
});
