// Testes do CT-e: chave de acesso, XML no schema oficial e assinatura.
// Rodar: node --test test/   (a validação no schema precisa do xmllint)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { montarCte, digitoVerificador, incluirQrCode, dataHoraBrasilia } = require('../../src/cte/montarCte');
const { lerPfx } = require('../../src/cte/certificado');
const { assinar, conferir } = require('../../src/cte/assinatura');
const { pfxDeTeste, dadosDeExemplo, validarXsd, temXmllint, SCHEMAS } = require('./apoio');

test('dígito verificador da chave (módulo 11)', () => {
  // Pesos 2..9 da direita para a esquerda; resto 0 ou 1 → DV 0.
  const base = '4310074874095000013057001000000001100000001';
  const dv = digitoVerificador(base);
  assert.ok(dv >= 0 && dv <= 9);
  assert.strictEqual(digitoVerificador('0000000000000000000000000000000000000000000'), 0);
});

test('data/hora no fuso de Brasília', () => {
  assert.match(dataHoraBrasilia(new Date('2026-10-10T15:00:00Z')), /^2026-10-10T12:00:00-03:00$/);
});

test('certificado A1: lê o .pfx, pega titular e CNPJ, recusa senha errada', () => {
  const pfx = pfxDeTeste('segredo');
  const c = lerPfx(pfx, 'segredo');
  assert.strictEqual(c.cnpj, '11222333000181');
  assert.strictEqual(c.titular, 'TRANSPORTES TESTE LTDA');
  assert.throws(() => lerPfx(pfx, 'errada'), /Senha do certificado incorreta/);
});

test('CT-e: chave, campos de homologação e texto escapado', () => {
  const { xml, chave, tpAmb } = montarCte(dadosDeExemplo());
  assert.strictEqual(chave.length, 44);
  assert.strictEqual(chave.slice(0, 2), '35');
  assert.strictEqual(chave.slice(20, 22), '57');
  assert.strictEqual(tpAmb, 2);
  assert.match(xml, /<xNome>CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL<\/xNome>/);
  assert.match(xml, /&amp; conferir volumes &lt;frageis&gt;/);
  assert.match(xml, /<indIEToma>1<\/indIEToma>/);
});

test('CT-e: recusa dados incompletos com mensagem clara', () => {
  assert.throws(() => montarCte(dadosDeExemplo({ nfes: [] })), /NF-e transportada/);
  assert.throws(() => montarCte(dadosDeExemplo({ valores: { vTPrest: 0 } })), /valor total da presta/);
  const semIbge = dadosDeExemplo();
  semIbge.remetente.endereco.cMun = '123';
  assert.throws(() => montarCte(semIbge), /Código IBGE/);
});

test('CT-e assinado: assinatura confere e o XML passa no schema oficial', { skip: !temXmllint() && 'sem xmllint' }, () => {
  const cert = lerPfx(pfxDeTeste(), '1234');
  const variantes = [
    dadosDeExemplo(),
    dadosDeExemplo({ icms: { cst: 'SN' }, emitente: { ...dadosDeExemplo().emitente, crt: 1 } }),
    dadosDeExemplo({ icms: { cst: '40' }, tomador: '3' }),
    dadosDeExemplo({ icms: { cst: '20', pRedBC: 20, vBC: 280.4, pICMS: 12, vICMS: 33.65 } }),
    dadosDeExemplo({ icms: { cst: 'OUTRAUF', vBC: 350.5, pICMS: 12, vICMS: 42.06 }, inicio: { cMun: '3304557', xMun: 'RIO DE JANEIRO', UF: 'RJ' } }),
    dadosDeExemplo({ ibscbs: { cst: '000', cClassTrib: '000001', vBC: 350.5, pIBSUF: 0.1, pIBSMun: 0, pCBS: 0.9 } }),
    dadosDeExemplo({ tomador: '4', outroTomador: { cpf: '12345678909', xNome: 'PAGADOR PF', endereco: dadosDeExemplo().remetente.endereco } }),
  ];
  for (const d of variantes) {
    const { xml, chave, tpAmb } = montarCte(d);
    const assinado = incluirQrCode(assinar(xml, 'infCte', cert), 'https://dfe-portal.svrs.rs.gov.br/cte/qrCode', chave, tpAmb);
    assert.ok(conferir(assinado, cert.certPem), 'assinatura não confere');
    assert.match(assinado, new RegExp(`<Reference URI="#CTe${chave}">`));
    const erro = validarXsd(assinado, path.join(SCHEMAS, 'cte_v4.00.xsd'));
    assert.strictEqual(erro, null, erro);
    // O conteúdo do modal (rodo) é validado no schema próprio dele.
    const rodo = /<rodo>[\s\S]*<\/rodo>/.exec(assinado)[0].replace('<rodo>', '<rodo xmlns="http://www.portalfiscal.inf.br/cte">');
    const erroRodo = validarXsd(rodo, path.join(SCHEMAS, 'cteModalRodoviario_v4.00.xsd'));
    assert.strictEqual(erroRodo, null, erroRodo);
  }
});

test('mensagens para a SEFAZ (status, consulta, cancelamento, CC-e) passam no schema', { skip: !temXmllint() && 'sem xmllint' }, () => {
  const { xmlStatus, xmlConsulta } = require('../../src/cte/sefaz');
  const { cancelamento, cartaCorrecao } = require('../../src/cte/eventos');
  const cert = lerPfx(pfxDeTeste(), '1234');
  const { chave } = montarCte(dadosDeExemplo());
  const valida = (xml, xsd) => { const e = validarXsd(xml, path.join(SCHEMAS, xsd)); assert.strictEqual(e, null, e); };
  valida(xmlStatus('SP', 2), 'consStatServCTe_v4.00.xsd');
  valida(xmlConsulta(2, chave), 'consSitCTe_v4.00.xsd');
  const base = { chave, cnpj: '11222333000181', uf: 'SP', tpAmb: 2 };
  const eventos = [
    [cancelamento({ ...base, nProt: '135260000000001', justificativa: 'Erro na digitacao do valor & do peso' }), 'evCancCTe_v4.00.xsd', 'evCancCTe'],
    [cartaCorrecao({ ...base, nSeq: 2, correcoes: [{ grupo: 'compl', campo: 'xObs', valor: 'Entregar na doca 3' }] }), 'evCCeCTe_v4.00.xsd', 'evCCeCTe'],
  ];
  for (const [xml, xsdDet, raiz] of eventos) {
    const assinado = assinar(xml, 'infEvento', cert);
    assert.ok(conferir(assinado, cert.certPem));
    valida(assinado, 'eventoCTe_v4.00.xsd');
    const det = new RegExp(`<${raiz}>[\\s\\S]*</${raiz}>`).exec(assinado)[0].replace(`<${raiz}>`, `<${raiz} xmlns="http://www.portalfiscal.inf.br/cte">`);
    valida(det, xsdDet);
  }
  assert.throws(() => cancelamento({ ...base, nProt: '135260000000001', justificativa: 'curta' }), /15 caracteres/);
});

test('CNPJ alfanumérico: chave e XML aceitos', { skip: !temXmllint() && 'sem xmllint' }, () => {
  const d = dadosDeExemplo();
  d.emitente.cnpj = '12.ABC.345/01DE-35';
  const { xml, chave } = montarCte(d);
  assert.strictEqual(chave.slice(6, 20), '12ABC34501DE35');
  const cert = lerPfx(pfxDeTeste(), '1234');
  const e = validarXsd(assinar(xml, 'infCte', cert), path.join(SCHEMAS, 'cte_v4.00.xsd'));
  assert.strictEqual(e, null, e);
});
