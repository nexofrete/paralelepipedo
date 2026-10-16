const test = require('node:test');
const assert = require('node:assert');
const { celula } = require('../src/utils/csv');

test('csv: texto que parece fórmula vira texto, número negativo não', () => {
  assert.strictEqual(celula('=1+1'), "'=1+1");
  assert.strictEqual(celula('+5511'), "'+5511");
  assert.strictEqual(celula('@SUM(A1)'), "'@SUM(A1)");
  assert.strictEqual(celula('-12,50'), '-12,50');
  assert.strictEqual(celula('-2.5'), '-2.5');
  assert.strictEqual(celula('- texto'), "'- texto");
  assert.strictEqual(celula('Cia "A"'), '"Cia ""A"""');
  assert.strictEqual(celula('a\nb'), '"a\nb"');
  assert.strictEqual(celula('a,b', ','), '"a,b"');
  assert.strictEqual(celula('x', ';', { aspas: true }), '"x"');
  assert.strictEqual(celula(null), '');
});
