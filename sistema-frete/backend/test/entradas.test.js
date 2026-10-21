// Notas de entrada: leitura do XML (NF-e e CT-e), categoria pelo NCM e CFOP de entrada sugerido.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { lerXml, categoriaDoNcm, cfopEntrada } = require('../src/entradas');

const xml = (nome) => fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');

test('Entradas: NF-e de diesel com ICMS monofásico e duplicatas', () => {
  const n = lerXml(xml('entrada-nfe-diesel.xml'));
  assert.strictEqual(n.modelo, '55');
  assert.strictEqual(n.numero, '4567');
  assert.strictEqual(n.emitente.doc, '44555666000177');
  assert.strictEqual(n.destinatario_doc, '11222333000181');
  assert.strictEqual(n.valor_total, 12500);
  assert.strictEqual(n.icms, 2294);   // 54 do ARLA + 2.240 do diesel monofásico
  assert.strictEqual(n.categoria, 'combustivel');
  assert.deepStrictEqual(n.duplicatas.map((d) => d.vencimento), ['2026-11-04', '2026-11-19']);
  assert.strictEqual(n.itens[0].icms, 2240);
});

test('Entradas: CT-e tomado (toma4) vira frete de terceiro', () => {
  const n = lerXml(xml('entrada-cte.xml'));
  assert.strictEqual(n.modelo, '57');
  assert.strictEqual(n.destinatario_doc, '11222333000181');
  assert.strictEqual(n.categoria, 'frete_terceiro');
  assert.strictEqual(n.icms, 180);
  assert.strictEqual(n.valor_total, 1500);
});

test('Entradas: categoria pelo NCM, CFOP de entrada e XML que não é nota', () => {
  assert.strictEqual(categoriaDoNcm('40112090'), 'pneus');
  assert.strictEqual(categoriaDoNcm('87089990'), 'manutencao');
  assert.strictEqual(categoriaDoNcm('84713012'), null);
  assert.strictEqual(cfopEntrada('5656', true, { combustivel: true }), '1653');
  assert.strictEqual(cfopEntrada('6102', false), '2556');
  assert.strictEqual(cfopEntrada('5933', true), '1933');
  assert.strictEqual(cfopEntrada('6352', false, { cte: true }), '2351');
  assert.throws(() => lerXml('<a/>'), /nem um CT-e/);
  assert.throws(() => lerXml('não é xml <'), /XML|CT-e/);
});
