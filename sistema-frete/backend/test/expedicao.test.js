// Painel de expedição (src/expedicao.js): a etapa de cada nota.
const test = require('node:test');
const assert = require('node:assert');
const { etapa } = require('../src/expedicao');

test('etapa da nota pela saída, pela ordem de coleta e pela visita do pátio', () => {
  assert.strictEqual(etapa({ expedida_hoje: true, ordem: { status: 'aceita', situacao: 'Coletada' } }), 'Expedida hoje');
  assert.strictEqual(etapa({ ordem: null }), 'Sem ordem de coleta');
  assert.strictEqual(etapa({ ordem: { status: 'rascunho', situacao: 'Rascunho' } }), 'Ordem em rascunho');
  assert.strictEqual(etapa({ ordem: { status: 'enviada', situacao: 'Aguardando confirmação' } }), 'Ordem enviada');
  assert.strictEqual(etapa({ ordem: { status: 'enviada', situacao: 'Sem resposta' } }), 'Sem resposta');
  assert.strictEqual(etapa({ ordem: { status: 'enviada', situacao: 'Atrasada' } }), 'Sem resposta');
  assert.strictEqual(etapa({ ordem: { status: 'aceita', situacao: 'Confirmada' } }), 'Coleta confirmada');
  assert.strictEqual(etapa({ ordem: { status: 'aceita', situacao: 'Atrasada' } }), 'Coleta atrasada');
  assert.strictEqual(etapa({ ordem: { status: 'aceita', situacao: 'No pátio' } }), 'No pátio');
});
