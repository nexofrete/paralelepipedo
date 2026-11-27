const test = require('node:test');
const assert = require('node:assert');
const { horas, LIMITE } = require('../src/relatoriosPedidos');
const { RELATORIOS, catalogo } = require('../src/relatoriosEntregas');

test('horas entre dois momentos da tela Pedidos', () => {
  assert.strictEqual(horas('2026-11-25 08:00', '2026-11-25 12:30'), 4.5);
  assert.strictEqual(horas('2026-11-25 08:00', '2026-11-26 08:00'), 24);
  assert.strictEqual(horas(null, '2026-11-25 08:00'), null);
  assert.strictEqual(horas('2026-11-26 08:00', '2026-11-25 08:00'), null); // ordem trocada não vira tempo negativo
});

test('relatórios de pedidos 107 a 116 na tela 407', () => {
  const nums = catalogo('pedidos').map((r) => r.numero).sort((a, b) => a - b);
  assert.deepStrictEqual(nums, [107, 108, 109, 110, 111, 112, 113, 114, 115, 116]);
  assert.ok(RELATORIOS[107].semPeriodo && RELATORIOS[108].semPeriodo && RELATORIOS[109].semPeriodo);
  assert.ok(RELATORIOS[111].detalhe && RELATORIOS[113].detalhe);
  assert.deepStrictEqual(Object.keys(LIMITE), ['Aguardando nota', 'Em separação', 'Em conferência', 'Separado']);
});
