// Resultado por CT-e: rateio do custo da viagem sem perder centavos.
const test = require('node:test');
const assert = require('node:assert');
const { ratear, pesoKg } = require('../src/resultado');

test('resultado: rateio pelo peso, sem perder centavos', () => {
  const partes = ratear(1000, [{ peso: 1000 }, { peso: 2000 }, { peso: 0 }]);
  assert.deepStrictEqual(partes, [333.33, 666.67, 0]);   // o centavo que sobra vai para a maior parte
});

test('resultado: sem peso, rateia pela receita; sem nada, em partes iguais', () => {
  assert.deepStrictEqual(ratear(300, [{ peso: 0, receita: 100 }, { peso: 0, receita: 200 }]), [100, 200]);
  const iguais = ratear(100, [{ peso: 0, receita: 0 }, { peso: 0, receita: 0 }, { peso: 0, receita: 0 }]);
  assert.strictEqual(Math.round(iguais.reduce((s, x) => s + x, 0) * 100) / 100, 100);
  assert.deepStrictEqual(ratear(0, [{ peso: 1 }]), [0]);
  assert.deepStrictEqual(ratear(50, []), []);
});

test('resultado: peso do CT-e em kg ou toneladas', () => {
  assert.strictEqual(pesoKg({ carga: { quantidades: [{ cUnid: '03', qCarga: 12 }, { cUnid: '01', qCarga: 520.5 }] } }), 520.5);
  assert.strictEqual(pesoKg({ carga: { quantidades: [{ cUnid: '02', qCarga: 1.5 }] } }), 1500);
  assert.strictEqual(pesoKg({}), 0);
});
