const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { dataHora, lerPlanilha } = require('../src/pedidosWms');
const { situacaoPedido } = require('../src/pedidos');

const planilha = (linhas) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas, { cellDates: true }), 'Plan1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

test('data e hora do WMS', () => {
  assert.strictEqual(dataHora(new Date(2026, 10, 13, 18, 23, 5)), '2026-11-13 18:23:05');
  assert.strictEqual(dataHora('13/11/2026 08:05'), '2026-11-13 08:05:00');
  assert.strictEqual(dataHora('13/11/26'), '2026-11-13 00:00:00');
  assert.strictEqual(dataHora('2026-11-13T07:00:00'), '2026-11-13 07:00:00');
  assert.strictEqual(dataHora('177541'), null);
  assert.strictEqual(dataHora('N'), null);
});

test('planilha do WMS com as colunas da planilha de pedidos', () => {
  const r = lerPlanilha(planilha([
    ['Número Pedido', 'CNPJ', 'Cliente', 'Status/WMS', 'Data Inicial', 'Usuário', 'Data/Imp. Etq', 'Qtd. Etiquetas', 'Data Início', 'Data Finalização', 'Cancelado Wms'],
    ['215619', '65.838.805/0001-54', 'MARIA EDUARDA', 'CONFERIDO', new Date(2026, 10, 12, 9, 0), 'JOAO', new Date(2026, 10, 12, 10, 30), 55, new Date(2026, 10, 12, 9, 10), new Date(2026, 10, 12, 10, 20), 'N'],
    ['215620', '', '', 'EM SEPARACAO', '', 'MARIA', '', '', '12/11/2026 11:00', '', ''],
  ]));
  assert.strictEqual(r.linhas.length, 2);
  const [a, b] = r.linhas;
  assert.strictEqual(a.numero_pedido, '215619');
  assert.strictEqual(a.status, 'CONFERIDO');
  assert.strictEqual(a.qtd_etiquetas, 55);
  assert.strictEqual(a.separacao_fim, '2026-11-12 10:20:00');
  assert.strictEqual(a.cancelado, false);
  assert.strictEqual(b.separacao_inicio, '2026-11-12 11:00:00');
  assert.strictEqual(b.separacao_fim, null);
  assert.deepStrictEqual(r.invalidos, {});
});

test('colunas deslocadas: recusa a planilha e não grava nada', () => {
  assert.throws(() => lerPlanilha(planilha([
    ['Número Pedido', 'Status/WMS', 'Qtd. Etiquetas', 'Data Início', 'Cancelado Wms'],
    ['197370', 'EXPEDICAO', new Date(2026, 0, 2, 12, 53), '177541', 'V'],
  ])), /parecem deslocadas.*Qtd\. Etiquetas/);
});

test('um valor estranho aqui e ali só fica vazio e é avisado', () => {
  const r = lerPlanilha(planilha([
    ['Número Pedido', 'Qtd. Etiquetas'], ['1', 5], ['2', 'muitas'], ['3', 7],
  ]));
  assert.strictEqual(r.linhas[1].qtd_etiquetas, null);
  assert.deepStrictEqual(r.invalidos, { qtd_etiquetas: 1 });
});

test('planilha sem número do pedido ou sem coluna do WMS é recusada', () => {
  assert.throws(() => lerPlanilha(planilha([['Cliente', 'Status/WMS'], ['X', 'Y']])), /Número Pedido/);
  assert.throws(() => lerPlanilha(planilha([['Número Pedido', 'Cliente'], ['1', 'X']])), /nenhuma coluna do WMS/);
});

test('situação do pedido com o WMS', () => {
  assert.strictEqual(situacaoPedido({ tem_nota: false }), 'Aguardando nota');
  assert.strictEqual(situacaoPedido({ tem_nota: false, sep_inicio: 'x' }), 'Em separação');
  assert.strictEqual(situacaoPedido({ tem_nota: false, sep_inicio: 'x', sep_fim: 'y' }), 'Separado');
  assert.strictEqual(situacaoPedido({ tem_nota: true, sep_fim: 'y' }), 'Faturado');
  assert.strictEqual(situacaoPedido({ tem_nota: false, cancelado_wms: true }), 'Cancelado');
});

test('filtro da tela Pedidos pelo status/tipo do ERP', () => {
  const { passaFiltro } = require('../src/pedidos');
  const cfg = { filtrar: true, estatus: ['A'], tipos: ['P'] };
  assert.strictEqual(passaFiltro(cfg, 'A', 'P'), true);
  assert.strictEqual(passaFiltro(cfg, 'a', 'p'), true);
  assert.strictEqual(passaFiltro(cfg, 'T', 'P'), false);
  assert.strictEqual(passaFiltro(cfg, 'A', 'B'), false);
  assert.strictEqual(passaFiltro(cfg, null, null), false, 'sem status não aparece com o filtro ligado');
  assert.strictEqual(passaFiltro({ ...cfg, tipos: [] }, 'A', 'X'), true, 'tipo vazio aceita qualquer');
  assert.strictEqual(passaFiltro({ ...cfg, filtrar: false }, null, null), true);
});
