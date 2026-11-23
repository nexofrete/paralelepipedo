// Pedidos e pré-notas (src/pedidos.js): a situação de cada um.
const test = require('node:test');
const assert = require('node:assert');
const { situacaoPedido, situacaoPrenota } = require('../src/pedidos');

test('situação do pedido, do ERP até a entrega', () => {
  assert.strictEqual(situacaoPedido({ tem_nota: false }), 'Aguardando nota');
  assert.strictEqual(situacaoPedido({ tem_nota: true }), 'Faturado');
  assert.strictEqual(situacaoPedido({ tem_nota: true, embarque_id: 3 }), 'Em embarque');
  assert.strictEqual(situacaoPedido({ tem_nota: true, embarque_id: 3, ordem_id: 9 }), 'Coleta pedida');
  assert.strictEqual(situacaoPedido({ tem_nota: true, ordem_id: 9, chave_cte: 'X' }), 'Coletado / em trânsito');
  assert.strictEqual(situacaoPedido({ tem_nota: true, data_saida: '2026-11-20', data_entrega: '2026-11-22' }), 'Entregue');
  assert.strictEqual(situacaoPedido({ tem_nota: true, cancelado: true }), 'Cancelado');
});

test('situação da pré-nota', () => {
  assert.strictEqual(situacaoPrenota({ dias: 1 }), 'A faturar');
  assert.strictEqual(situacaoPrenota({ dias: 5 }), 'Parada sem faturar');
  assert.strictEqual(situacaoPrenota({ dias: 5, numero_nf: '123' }), 'NF sem XML');
  assert.strictEqual(situacaoPrenota({ faturada: true, divergencias: [] }), 'Faturada, confere');
  assert.strictEqual(situacaoPrenota({ faturada: true, divergencias: ['valor'] }), 'Faturada, mudou');
  assert.strictEqual(situacaoPrenota({ cancelada: true, dias: 9 }), 'Cancelada no ERP');
});
