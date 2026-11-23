// Relatórios de planejamento (src/relatoriosPlanejamento.js): a curva ABC.
const test = require('node:test');
const assert = require('node:assert');

test('planejamento: curva ABC (A até 80% do frete, a linha que cruza ainda é A; B até 95%)', () => {
  const { curvaAbc } = require('../src/relatoriosPlanejamento');
  const r = curvaAbc([{ n: 'c', v: 5 }, { n: 'a', v: 70 }, { n: 'b', v: 20 }, { n: 'd', v: 5 }], 'v');
  assert.deepStrictEqual(r.map((x) => `${x.n}${x.classe}`), ['aA', 'bA', 'cB', 'dC']);
  assert.strictEqual(r[3].acum, 1);
  assert.deepStrictEqual(curvaAbc([], 'v'), []);
});
