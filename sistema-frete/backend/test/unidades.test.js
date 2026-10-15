// Filiais: lista de cidades atendidas e cadastro da unidade.
const test = require('node:test');
const assert = require('node:assert');
const { lerCidades, lerUnidade } = require('../src/unidades');

test('cidades atendidas: por linha, vírgula ou ponto e vírgula, com ou sem UF, sem acento', () => {
  assert.deepStrictEqual(lerCidades('Rio de Janeiro/RJ\nNiterói - rj; Duque de Caxias,  São Gonçalo/RJ\n\n'), [
    { cidade: 'rio de janeiro', uf: 'RJ' }, { cidade: 'niteroi', uf: 'RJ' }, { cidade: 'duque de caxias', uf: null }, { cidade: 'sao goncalo', uf: 'RJ' }]);
  assert.deepStrictEqual(lerCidades(''), []);
});

test('unidade: sigla limpa em maiúsculas e campos obrigatórios', () => {
  const u = lerUnidade({ sigla: ' rj-o ', nome: 'Filial Rio', cidade: 'Rio de Janeiro', uf: 'rj' });
  assert.deepStrictEqual([u.sigla, u.uf, u.ativa], ['RJO', 'RJ', true]);
  assert.throws(() => lerUnidade({ sigla: 'x', nome: 'a', cidade: 'b', uf: 'SP' }), /sigla/);
  assert.throws(() => lerUnidade({ sigla: 'ABC', nome: '', cidade: 'b', uf: 'SP' }), /nome/);
  assert.throws(() => lerUnidade({ sigla: 'ABC', nome: 'a', cidade: '', uf: 'SP' }), /cidade/);
});
