const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { lerGrid, paraPedidos, urlBusca } = require('../src/wms');
const { lerPlanilha } = require('../src/pedidosWms');
const { situacaoPedido } = require('../src/pedidos');

// Recorte no formato da tela Expedição Mercadorias do Imperium.
const GRID = `<form id="formGrid"><div>Total de 3 registros encontrados.</div>
<table class="gTable grid-expedicao"><thead><tr><th></th><th>Expedição</th><th>Cargas</th><th>Tipo Pedido</th><th>Cubagem</th><th>Peso</th><th>Qtd.Ped.</th><th>Placa</th>
<th>Itinerarios</th><th>Motorista</th><th>Data Inicial</th><th>Data Final</th><th>Imprimir</th><th>% Conferência</th><th>Status</th></tr></thead><tbody>
<tr><td><input type="checkbox"></td><td>84472</td><td>217227</td><td>ENTREGA</td><td>0,419</td><td>3,796</td><td>1</td><td>SEM TRANSPORTADORA 25-11-2026</td><td></td><td></td><td>25/11/2026 16:16:03</td><td></td><td>SIM</td><td>0,00</td><td>INTEGRADO</td></tr>
<tr><td><input type="checkbox"></td><td>84470</td><td>217200, 217201</td><td>ENTREGA</td><td>2,500</td><td>623,718</td><td>2</td><td>ABC1D23</td><td>ROTA SUL</td><td>JOAO</td><td>24/11/2026 08:00:00</td><td>24/11/2026 15:30:10</td><td>NÃO</td><td>100,00</td><td>FINALIZADO</td></tr>
<tr><td><input type="checkbox"></td><td>84460</td><td>217100</td><td>ENTREGA</td><td>1</td><td>10</td><td>1</td><td></td><td></td><td></td><td>23/11/2026 09:00:00</td><td></td><td>SIM</td><td>0</td><td>CANCELADA</td></tr>
</tbody></table></form>`;

test('lê a tabela da Expedição Mercadorias', () => {
  const g = lerGrid(GRID);
  assert.strictEqual(g.total, 3);
  assert.strictEqual(g.linhas.length, 3);
  const [a, b] = g.linhas;
  assert.deepStrictEqual(a.cargas, ['217227']);
  assert.strictEqual(a.data_inicial, '2026-11-25 16:16:03');
  assert.strictEqual(a.cubagem, 0.419);
  assert.strictEqual(a.imprimir, true);
  assert.deepStrictEqual(b.cargas, ['217200', '217201']);
  assert.strictEqual(b.peso, 623.718);
  assert.strictEqual(b.conferencia_pct, 100);
  assert.strictEqual(b.expedicao_fim, '2026-11-24 15:30:10');
});

test('uma linha por pedido, sem "SEM TRANSPORTADORA" como placa e com o cancelamento', () => {
  const p = paraPedidos(lerGrid(GRID).linhas);
  assert.deepStrictEqual(p.map((x) => x.numero_pedido), ['217227', '217200', '217201', '217100']);
  assert.strictEqual(p[0].placa, null);
  assert.strictEqual(p[1].placa, 'ABC1D23');
  assert.strictEqual(p[1].motorista, 'JOAO');
  assert.strictEqual(p[3].cancelado, true);
  assert.strictEqual(p[0].cancelado, false);
});

test('tela sem a tabela', () => {
  assert.strictEqual(lerGrid('<html>login</html>').sem_tabela, true);
});

test('endereço da busca: o copiado do navegador, com o período e sem os outros filtros', () => {
  const u = new URL(urlBusca({ url: 'http://10.150.15.66/auth/login',
    url_expedicao: 'http://10.150.15.66/expedicao?submit=Buscar&idExpedicao=&dataInicial1=25%2F11%2F2026&dataInicial2=25%2F11%2F2026&dataFinal1=&dataFinal2=&status=&codCargaExterno=214218&placa=&pedido=&control=roll&produto=' },
  new Date(Date.UTC(2026, 10, 19)), new Date(Date.UTC(2026, 10, 25))));
  assert.strictEqual(u.pathname, '/expedicao');
  assert.strictEqual(u.searchParams.get('dataInicial1'), '19/11/2026');
  assert.strictEqual(u.searchParams.get('dataInicial2'), '25/11/2026');
  assert.strictEqual(u.searchParams.get('codCargaExterno'), '');
  assert.strictEqual(u.searchParams.get('control'), 'roll');
});

test('Exportar da tela do WMS também entra pela planilha (Cargas = pedido)', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Expedição', 'Cargas', 'Placa', 'Data Inicial', 'Data Final', '% Conferência', 'Status'],
    ['84472', '217227', 'ABC1D23', '25/11/2026 16:16:03', '', '50,00', 'EM CONFERENCIA']]), 'P');
  const r = lerPlanilha(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.strictEqual(r.linhas[0].numero_pedido, '217227');
  assert.strictEqual(r.linhas[0].expedicao_numero, '84472');
  assert.strictEqual(r.linhas[0].conferencia_pct, 50);
  assert.strictEqual(r.linhas[0].expedicao, undefined);
});

test('situação pelo status do WMS', () => {
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'INTEGRADO' }), 'Aguardando nota');
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'EM SEPARACAO' }), 'Em separação');
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'PRIMEIRA CONFERENCIA' }), 'Em conferência');
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'CONFERIDO' }), 'Separado');
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'PARCIALMENTE FINALIZADO' }), 'Separado');
  assert.strictEqual(situacaoPedido({ tem_nota: true, status_wms: 'FINALIZADO' }), 'Faturado');
});
