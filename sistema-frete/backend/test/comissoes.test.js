// Comissões: validação do cadastro do vendedor.
const test = require('node:test');
const assert = require('node:assert');
const { lerVendedor } = require('../src/comissoes');

test('comissões: vendedor com percentual em vírgula, base e documento', () => {
  const v = lerVendedor({ nome: ' Ana ', comissao_pct: '2,5', base: 'faturado', documento: '123.456.789-09' });
  assert.deepStrictEqual([v.nome, v.comissao_pct, v.base, v.documento], ['Ana', 2.5, 'faturado', '12345678909']);
  assert.strictEqual(lerVendedor({ nome: 'B', comissao_pct: '3' }).base, 'recebido');   // padrão: sobre o recebido
});

test('comissões: recusa nome vazio, percentual fora de 0–50% e documento inválido', () => {
  assert.throws(() => lerVendedor({ nome: '', comissao_pct: 3 }), /nome/);
  assert.throws(() => lerVendedor({ nome: 'A', comissao_pct: '80' }), /0% e 50%/);
  assert.throws(() => lerVendedor({ nome: 'A', comissao_pct: 'abc' }), /0% e 50%/);
  assert.throws(() => lerVendedor({ nome: 'A', comissao_pct: 3, documento: '123' }), /CPF\/CNPJ/);
  assert.throws(() => lerVendedor({ nome: 'A', comissao_pct: 3, email: 'x@' }), /E-mail/);
});
