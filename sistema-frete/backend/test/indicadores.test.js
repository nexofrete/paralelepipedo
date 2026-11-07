// Indicadores: região de cada UF e a soma por grupo (contratado, pago, a pagar, % sobre a NF, R$/kg).
const test = require('node:test');
const assert = require('node:assert');
const { regiaoDaUf, somar, periodo } = require('../src/indicadores');

test('cada UF cai na sua região', () => {
  assert.strictEqual(regiaoDaUf('sp'), 'Sudeste');
  assert.strictEqual(regiaoDaUf('DF'), 'Centro-Oeste');
  assert.strictEqual(regiaoDaUf('AM'), 'Norte');
  assert.strictEqual(regiaoDaUf('PE'), 'Nordeste');
  assert.strictEqual(regiaoDaUf('RS'), 'Sul');
  assert.strictEqual(regiaoDaUf(''), 'Sem UF');
});

test('soma por grupo separa pago e a pagar', () => {
  const r = somar([
    { transportadora: 'A', valor: 100, peso: 50, valor_nf: 2000, situacao: 'pago' },
    { transportadora: 'A', valor: 60, peso: 30, valor_nf: 1000, situacao: 'liberado' },
    { transportadora: 'B', valor: 500, peso: 0, valor_nf: 0, situacao: 'faturado' },
  ], (l) => l.transportadora);
  assert.deepStrictEqual(r.map((x) => x.chave), ['B', 'A']);
  const a = r[1];
  assert.deepStrictEqual([a.ctes, a.contratado, a.pago, a.pendente, a.percentual_nf, a.por_kg], [2, 160, 100, 60, 5.33, 2]);
  assert.strictEqual(r[0].por_kg, null);
});

test('período: padrão é o mês, e o início não pode passar do fim', () => {
  assert.deepStrictEqual(periodo({ de: '2026-03-01', ate: '2026-03-31' }), { de: '2026-03-01', ate: '2026-03-31' });
  assert.throws(() => periodo({ de: '2026-04-01', ate: '2026-03-01' }));
});
