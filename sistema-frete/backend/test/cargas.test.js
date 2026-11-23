// Cargas (src/cargas.js): ocupação, rateio da lotação, conferência do pré-conhecimento, lotação e capacidade.
const test = require('node:test');
const assert = require('node:assert');
const c = require('../src/cargas');

test('ocupação: o maior entre peso e m³', () => {
  assert.strictEqual(c.ocupacao(3000, 10, 6000, 30), 0.5);
  assert.strictEqual(c.ocupacao(1000, 27, 6000, 30), 0.9);
  assert.strictEqual(c.ocupacao(1000, 5, null, null), null);
});

test('rateio da lotação: pelo peso, senão pelo valor; a última fecha os centavos', () => {
  assert.deepStrictEqual(c.ratear(250, [{ peso: 600 }, { peso: 400 }]), [150, 100]);
  assert.deepStrictEqual(c.ratear(100, [{ peso: 600, valor: 1 }, { peso: 0, valor: 3 }]), [25, 75]);
  assert.deepStrictEqual(c.ratear(100, [{}, {}, {}]), [33.33, 33.33, 33.34]);
});

test('pré-conhecimento × CT-e: tolerância de 2% ou R$ 2', () => {
  assert.deepStrictEqual(c.conferir(100, 101.5), { dif: 1.5, confere: true });
  assert.deepStrictEqual(c.conferir(500, 509), { dif: 9, confere: true });
  assert.deepStrictEqual(c.conferir(500, 515), { dif: 15, confere: false });
  assert.strictEqual(c.conferir(null, 10), null);
});

test('lotação que serve ao destino e comporta a carga, a mais barata primeiro', () => {
  const tabs = [{ id: 1, ativa: true, uf_destino: 'RS', cidade_destino: 'Pelotas', valor_viagem: 300, cap_kg: 6000 },
    { id: 2, ativa: true, uf_destino: 'RS', cidade_destino: null, valor_viagem: 250, cap_kg: 500 },
    { id: 3, ativa: true, uf_destino: 'SC', cidade_destino: null, valor_viagem: 100, cap_kg: 9000 }];
  assert.deepStrictEqual(c.opcoesLotacao(tabs, { cidade: 'PELOTAS', uf: 'rs', peso: 400 }).map((t) => t.id), [2, 1]);
  assert.deepStrictEqual(c.opcoesLotacao(tabs, { cidade: 'Pelotas', uf: 'RS', peso: 900 }).map((t) => t.id), [1]);
});

test('aviso de capacidade da transportadora no dia', () => {
  const cap = { transportadora: 'X', veiculos_dia: 2, peso_dia_kg: 800 };
  assert.strictEqual(c.avisoCapacidade(cap, { veiculos: 1, peso: 500, m3: 0 }), null);
  assert.match(c.avisoCapacidade(cap, { veiculos: 3, peso: 1000, m3: 0 }), /3 veículos para 2 por dia; 1\.000 kg para 800 kg/);
  assert.strictEqual(c.avisoCapacidade(null, { veiculos: 9 }), null);
});
