const test = require('node:test');
const assert = require('node:assert');
const { somarDiasUteis, CATALOGO } = require('../../src/cte/ocorrencias');

test('previsão em dias úteis pula sábado e domingo', () => {
  assert.strictEqual(somarDiasUteis('2026-10-09', 1), '2026-10-12');   // sexta + 1 = segunda
  assert.strictEqual(somarDiasUteis('2026-10-12', 3), '2026-10-15');   // segunda + 3 = quinta
  assert.strictEqual(somarDiasUteis('2026-10-15', 3), '2026-10-20');   // quinta + 3 = terça
  assert.strictEqual(somarDiasUteis('2026-10-10', 0), '2026-10-10');
});

test('catálogo de ocorrências: ids únicos e códigos PROCEDA de 2 dígitos', () => {
  assert.strictEqual(new Set(CATALOGO.map((c) => c.id)).size, CATALOGO.length);
  CATALOGO.forEach((c) => assert.ok(c.codigo >= 0 && c.codigo <= 99, c.id));
  assert.ok(CATALOGO.some((c) => c.tipo === 'entrega' && c.codigo === 1));
});
