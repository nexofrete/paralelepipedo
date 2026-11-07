// Tratamento das ocorrências: culpa provável, prazo por grupo e o que a entrega encerra sozinha.
const test = require('node:test');
const assert = require('node:assert');
const { CULPA_PADRAO, PRAZO_GRUPO, CULPAS, SOLUCOES } = require('../src/cte/tratamento');
const { CATALOGO } = require('../src/cte/ocorrencias');

test('culpa provável aponta para uma culpa conhecida', () => {
  for (const [tipo, culpa] of Object.entries(CULPA_PADRAO)) {
    assert.ok(CATALOGO.some((c) => c.id === tipo), `tipo ${tipo} existe no catálogo`);
    assert.ok(CULPAS[culpa], `culpa ${culpa}`);
  }
  assert.strictEqual(CULPA_PADRAO.ausente, 'cliente');
  assert.strictEqual(CULPA_PADRAO.veiculo, 'empresa');
});

test('falta de volumes é problema, pede a quantidade e vai no OCOREN como extravio parcial', () => {
  const f = CATALOGO.find((c) => c.id === 'falta_volumes');
  assert.ok(f && f.tipo === 'problema' && f.pedeVolumes && f.grupo === 'Sinistro');
  assert.strictEqual(f.codigo, 81);
});

test('prazo: sinistro tem mais dias que o não entregue; soluções principais existem', () => {
  assert.ok(PRAZO_GRUPO.Sinistro > PRAZO_GRUPO['Não entregue']);
  for (const s of ['reentregue', 'devolvido', 'indenizado', 'abatido']) assert.ok(SOLUCOES[s]);
});
