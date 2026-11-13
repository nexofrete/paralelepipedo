// Tolerância da auditoria: a regra mais específica vale (src/toleranciaAuditoria.js).
const test = require('node:test');
const assert = require('node:assert');
const { regra, valorDe } = require('../src/toleranciaAuditoria');

const cfg = {
  geral: { valor: 1, pct: 0 },
  regras: new Map([
    ['0|pedagio', { valor: 5, pct: 0 }],     // pedágio, todas
    ['7|total', { valor: 0, pct: 2 }],       // transportadora 7, frete inteiro
    ['7|tde', { valor: 10, pct: 0 }],        // transportadora 7, TDE
  ]),
};

test('transportadora + componente > componente (todas) > total da transportadora > geral', () => {
  assert.deepStrictEqual(regra(cfg, 7, 'tde'), { valor: 10, pct: 0 });
  assert.deepStrictEqual(regra(cfg, 7, 'pedagio'), { valor: 5, pct: 0 });
  assert.deepStrictEqual(regra(cfg, 7, 'gris'), { valor: 0, pct: 2 });
  assert.deepStrictEqual(regra(cfg, 7, 'total'), { valor: 0, pct: 2 });
  assert.deepStrictEqual(regra(cfg, 9, 'total'), { valor: 1, pct: 0 });
  assert.deepStrictEqual(regra(cfg, null, 'tde'), { valor: 1, pct: 0 });
});

test('vale o maior entre o valor fixo e o percentual da base', () => {
  assert.strictEqual(valorDe(cfg, 7, 'total', 300), 6);   // 2% de 300
  assert.strictEqual(valorDe(cfg, 9, 'total', 300), 1);   // geral R$ 1
});
