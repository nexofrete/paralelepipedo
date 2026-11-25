const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { mapearPlanilha } = require('../src/importacaoErp');

// Planilha no formato da Timeline de pedidos, já com as colunas do mapa de carregamento.
function planilha(linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas, { cellDates: true }), 'Planilha1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('Timeline de pedidos: lê o mapa de carregamento junto com o pedido', () => {
  const buf = planilha([
    ['NR_PEDIDO', 'NR_NF', 'NM_CLIENTE', 'NR_MAPA_CARREGAMENTO', 'DS_MAPA_CARREGAMENTO', 'DT_REFERENCIA_MAPA', 'DT_LIBERACAO_MAPA', 'AJUDANTE_1_MAPA'],
    ['1001', '5001', 'CLIENTE A', '017020', 'TRANSPORTADORA X', new Date(2026, 0, 7, 22, 15), new Date(2026, 0, 7, 23, 0), 'FULANO DE TAL'],
    ['1002', '5002', 'CLIENTE B', '', '', '', '', ''],
  ]);
  const [a, b] = mapearPlanilha(buf);
  assert.strictEqual(a.numero_mapa, '017020');
  assert.strictEqual(a.mapa_descricao, 'TRANSPORTADORA X');
  // Mapa liberado à noite continua no dia certo (sem virar o dia pelo fuso).
  assert.strictEqual(a.mapa_data_referencia, '2026-01-07');
  assert.strictEqual(a.mapa_ajudante, 'FULANO DE TAL');
  assert.strictEqual(b.numero_mapa, null);
  assert.strictEqual(b.mapa_data_referencia, null);
});

test('Data de saída na coluna do ajudante não vira nome de ajudante', () => {
  const [a] = mapearPlanilha(planilha([['NR_PEDIDO', 'AJUDANTE_1_MAPA'], ['1001', 'DATA:07/01/26 HORA:17:30']]));
  assert.strictEqual(a.mapa_ajudante, null);
});

test('Planilha antiga, sem as colunas do mapa, continua funcionando', () => {
  const [a] = mapearPlanilha(planilha([['NR_PEDIDO', 'NR_NF'], ['1001', '5001']]));
  assert.strictEqual(a.numero_pedido, '1001');
  assert.strictEqual(a.mapa_descricao, null);
  assert.strictEqual(a.mapa_data_referencia, null);
});
