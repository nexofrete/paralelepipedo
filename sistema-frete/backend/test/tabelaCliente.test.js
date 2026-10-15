// Tabela de frete por cliente: a tabela com cliente só vale para ele (ou as filiais, pela raiz).
const test = require('node:test');
const assert = require('node:assert');
const { tabelaDoCliente } = require('../src/calculoFrete');

test('tabela do cliente: CNPJ exato, raiz (filiais) e tabela geral', () => {
  const t = { cliente_doc: '44555666000199', cliente_por_raiz: false };
  assert.strictEqual(tabelaDoCliente(t, '44.555.666/0001-99'), true);
  assert.strictEqual(tabelaDoCliente(t, '44555666000270'), false);
  assert.strictEqual(tabelaDoCliente({ ...t, cliente_por_raiz: true }, '44555666000270'), true);
  assert.strictEqual(tabelaDoCliente({ ...t, cliente_por_raiz: true }, '77888999000155'), false);
  assert.strictEqual(tabelaDoCliente(t, ''), false);
  assert.strictEqual(tabelaDoCliente({ cliente_doc: null }, '44555666000199'), false);   // tabela geral não é "do cliente"
  assert.strictEqual(tabelaDoCliente({ cliente_doc: '12345678909', cliente_por_raiz: true }, '12345678909'), true);
});
