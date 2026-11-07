// EDI dos parceiros: código PROCEDA da ocorrência → tipo de ocorrência do sistema.
const test = require('node:test');
const assert = require('node:assert');
const { tipoDaOcorrencia } = require('../src/ediParceiros');

test('códigos de entrega do PROCEDA viram entrega', () => {
  assert.strictEqual(tipoDaOcorrencia('01'), 'entregue');
  assert.strictEqual(tipoDaOcorrencia(2), 'entregue_fora');
  assert.strictEqual(tipoDaOcorrencia(31), 'entregue');
  assert.strictEqual(tipoDaOcorrencia(25), 'devolvido');
});

test('código livre (99/00) é lido pelo texto', () => {
  assert.strictEqual(tipoDaOcorrencia(99, 'SAIU PARA ENTREGA'), 'saiu');
  assert.strictEqual(tipoDaOcorrencia('00', 'Chegada na filial'), 'chegada');
  assert.strictEqual(tipoDaOcorrencia(99, 'qualquer coisa'), 'outros');
});

test('demais códigos seguem o catálogo; desconhecido vira outros', () => {
  assert.notStrictEqual(tipoDaOcorrencia(21), 'outros');
  assert.strictEqual(tipoDaOcorrencia(987), 'outros');
});
