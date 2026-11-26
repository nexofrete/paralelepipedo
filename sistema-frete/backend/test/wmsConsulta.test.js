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

test('OS da expedição: quem imprimiu as etiquetas e quando', () => {
  const { lerOs, lerImpressao, descreverOs } = require('../src/wms');
  assert.deepStrictEqual(lerImpressao('<table><tr><td>Impressão:</td><td>JOAO PEDRO PEREIRA</td><td>21/11/2026 10:30:00</td></tr></table>'),
    { usuario: 'JOAO PEDRO PEREIRA', impresso_em: '2026-11-21 10:30:00', como: 'rótulo de impressão' });
  assert.strictEqual(lerOs('<table><tr><th>Usuário</th><th>Data</th></tr><tr><td>MARIA SILVA</td><td>20/11/2026 08:15</td></tr></table>').usuario, 'MARIA SILVA');
  assert.strictEqual(lerOs('<p>sem impressão registrada</p>'), null);
  const d = descreverOs('<title>OS</title><div>Cliente: X</div><table><tr><th>Produto</th><th>Qtd</th></tr><tr><td>A</td><td>1</td></tr></table>');
  assert.deepStrictEqual(d.tabelas[0].titulos, ['Produto', 'Qtd']);
  assert.ok(d.rotulos.includes('Cliente'));
});

test('Resumo da busca por carga: etiquetas válidas', () => {
  const { lerResumo } = require('../src/wms');
  const r = lerResumo('<table><tr><td>Expedições</td><td>Qtd. Etq. Válidas</td><td>Qtd. Etq. Reentrega</td><td>Qtd. Pedidos</td></tr><tr><td><input value="1"></td><td><input value="16"></td><td><input value="0"></td><td><input value="1"></td></tr></table>');
  assert.strictEqual(r.etq_validas, 16);
  assert.strictEqual(r.pedidos, 1);
});

test('OS do Imperium: no histórico, a linha "Etiquetas Impressas" (a primeira, se houver reimpressão)', () => {
  const { lerOs } = require('../src/wms');
  const html = `<table><tr><th>OS</th><th>Responsavel</th><th>Atividade</th><th>Inicio</th><th>Fim</th></tr><tr><td>1</td><td>FULANO</td><td>SEPARACAO</td><td>18/11/2026 17:00</td><td>18/11/2026 18:00</td></tr></table>
    <table><tr><th>Data</th><th>Usuário</th><th>Mapa</th><th>Etiqueta</th><th>Andamento</th></tr>
    <tr><td>21/11/2026 14:28:04</td><td>UELLIGTON HENRIQUE</td><td></td><td></td><td>Expedição Finalizada</td></tr>
    <tr><td>19/11/2026 09:00:00</td><td>MARIA</td><td></td><td></td><td>Etiquetas Impressas</td></tr>
    <tr><td>18/11/2026 18:28:01</td><td>ROBSON ALVES</td><td></td><td></td><td>Etiquetas Impressas</td></tr>
    <tr><td>18/11/2026 17:10:00</td><td>JOSE</td><td></td><td></td><td>Conferência iniciada</td></tr></table>`;
  const o = lerOs(html);
  assert.strictEqual(o.usuario, 'ROBSON ALVES');
  assert.strictEqual(o.impresso_em, '2026-11-18 18:28:01');
  assert.match(o.como, /Etiquetas Impressas.*1ª de 2/);
  // Histórico sem impressão: não pega outra linha.
  assert.strictEqual(lerOs('<table><tr><th>Data</th><th>Usuário</th><th>Andamento</th></tr><tr><td>21/11/2026 14:28:04</td><td>UELLIGTON</td><td>Expedição Finalizada</td></tr></table>'), null);
});

test('OS: separador (quem separou) com início e fim da separação', () => {
  const { lerSeparacao } = require('../src/wms');
  const ativ = `<table><tr><th>OS</th><th>Responsavel</th><th>Atividade</th><th>Qtd.Conferida</th><th>Inicio</th><th>Fim</th></tr>
    <tr><td>1</td><td>MARCOS LIMA</td><td>SEPARACAO</td><td>10</td><td>18/11/2026 15:02:10</td><td>18/11/2026 16:40:55</td></tr>
    <tr><td>2</td><td>PAULO</td><td>SEPARAÇÃO</td><td>6</td><td>18/11/2026 15:30:00</td><td>18/11/2026 17:05:00</td></tr>
    <tr><td>3</td><td>JOSE</td><td>CONFERENCIA</td><td>16</td><td>18/11/2026 17:10</td><td>18/11/2026 18:00</td></tr></table>`;
  const a = lerSeparacao(ativ);
  assert.strictEqual(a.separador, 'MARCOS LIMA, PAULO');
  assert.strictEqual(a.sep_inicio, '2026-11-18 15:02:10');
  assert.strictEqual(a.sep_fim, '2026-11-18 17:05:00');
  assert.deepStrictEqual(a.atividades, ['SEPARACAO', 'SEPARAÇÃO', 'CONFERENCIA']);
  // Só conferência na tabela: não inventa separador (e diz as atividades que achou).
  const b = lerSeparacao('<table><tr><th>OS</th><th>Responsavel</th><th>Atividade</th><th>Inicio</th><th>Fim</th></tr><tr><td>1</td><td>JOSE</td><td>CONFERENCIA</td><td>18/11/2026 17:10</td><td>18/11/2026 18:00</td></tr></table>');
  assert.strictEqual(b.separador, null);
  assert.deepStrictEqual(b.atividades, ['CONFERENCIA']);
});

test('OS: linha do histórico da conferência não vira separador', () => {
  const { lerSeparacao, andamentosOs } = require('../src/wms');
  const hist = (linhas) => `<table><tr><th>Data</th><th>Usuário</th><th>Mapa</th><th>Etiqueta</th><th>Andamento</th></tr>${linhas.map(([d, u, a]) => `<tr><td>${d}</td><td>${u}</td><td></td><td></td><td>${a}</td></tr>`).join('')}</table>`;
  const conf = hist([['19/11/2026 18:44:30', 'ADRIANO SILVA', 'Conferência da Separação Finalizada'], ['18/11/2026 18:28:01', 'ROBSON ALVES', 'Etiquetas Impressas'], ['19/11/2026 18:00:00', 'ADRIANO SILVA', 'Etiqueta de Separação conferida']]);
  assert.strictEqual(lerSeparacao(conf).separador, null);
  assert.deepStrictEqual(andamentosOs(conf).map(([a]) => a), ['Conferência da Separação Finalizada', 'Etiquetas Impressas', 'Etiqueta de Separação conferida']);
  const sep = lerSeparacao(hist([['18/11/2026 16:00:00', 'ANA', 'Separação Finalizada'], ['18/11/2026 15:00:00', 'ANA', 'Separação Iniciada']]));
  assert.strictEqual(sep.separador, 'ANA');
  assert.strictEqual(sep.sep_inicio, '2026-11-18 15:00:00');
  assert.strictEqual(sep.sep_fim, '2026-11-18 16:00:00');
});

// Recorte da tela Expedição > Separação > Definir Equipe de Separação (apontamento) do Imperium.
const APONT = `<form method="get" action="/expedicao/index/apontamento-separacao" id="buscarApontamento">
  Inicio entre <input type="text" name="dataInicio" value="26/11/2026"> Até <input type="text" name="dataFim" value="26/11/2026">
  CPF Separador(a) <input type="text" name="cpf"> Etiqueta/Mapa <input type="text" name="etiqueta"> Expedição <input type="text" name="idExpedicao">
  <input type="hidden" name="control" value="busca"><input type="submit" name="submit" value="Buscar"></form>
<form method="post" action="/expedicao/index/apontamento-separacao/adicionar">Separadores <input name="qtd" value="1"> CPF Separador(a) <input name="cpfSep">
  Expedição <input name="exp"><input type="submit" name="adicionar" value="Adicionar"></form>
<fieldset><legend>Planos de Separação</legend><table><tr><th>Equipe</th><th>Mapa / Etiqueta Inicial - Final</th><th>Expedição</th><th>Separação</th><th>Data Início</th><th>Data Finalização</th><th>Status</th><th></th></tr>
<tr><td>(22082686795) DANILO FERREIRA</td><td>Etiquetas 101585485 à 101585618 (134 relacionadas)</td><td>83381<br>83383<br>83337</td><td>44237</td><td>19/11/2026 15:19:22</td><td>19/11/2026 18:44:30</td><td>FINALIZADA</td><td>x</td></tr>
<tr><td>(11111111111) PAULA SOUZA<br>(22222222222) RAFAEL LIMA</td><td>Mapa 77</td><td>83383</td><td>44240</td><td>19/11/2026 14:00:00</td><td></td><td>EM ANDAMENTO</td><td>x</td></tr>
</table></fieldset>`;

test('apontamento de separação: separador (sem CPF) e datas por expedição', () => {
  const { lerApontamentos, separacaoDaExpedicao } = require('../src/wms');
  const l = lerApontamentos(APONT);
  assert.strictEqual(l.length, 2);
  assert.deepStrictEqual(l[0].expedicoes, ['83381', '83383', '83337']);
  assert.deepStrictEqual(l[0].separadores, ['DANILO FERREIRA']);
  assert.deepStrictEqual(l[1].separadores, ['PAULA SOUZA', 'RAFAEL LIMA']);
  const so1 = separacaoDaExpedicao([l[0]], '83381');
  assert.deepStrictEqual(so1, { separador: 'DANILO FERREIRA', sep_inicio: '2026-11-19 15:19:22', sep_fim: '2026-11-19 18:44:30', status: 'FINALIZADA' });
  // Dois planos na mesma expedição, um ainda em andamento: todos os nomes, o início mais cedo e sem fim.
  const dois = separacaoDaExpedicao(l, '83383');
  assert.strictEqual(dois.separador, 'DANILO FERREIRA, PAULA SOUZA, RAFAEL LIMA');
  assert.strictEqual(dois.sep_inicio, '2026-11-19 14:00:00');
  assert.strictEqual(dois.sep_fim, null);
  assert.strictEqual(separacaoDaExpedicao(l, '99999'), null);
  assert.ok(!JSON.stringify(l).includes('22082686795'), 'o CPF não é guardado');
});

test('apontamento: só o formulário de BUSCA é usado; com botão que grava, nada é enviado', () => {
  const { formularioBusca } = require('../src/wms');
  const f = formularioBusca(APONT);
  assert.strictEqual(f.method, 'GET');
  assert.strictEqual(f.exp.nome, 'idExpedicao');
  assert.strictEqual(f.de.nome, 'dataInicio');
  assert.strictEqual(f.ate.nome, 'dataFim');
  assert.strictEqual(f.botao.nome, 'submit');
  // Um formulário só, com Buscar e Iniciar Separação juntos: recusado.
  assert.strictEqual(formularioBusca('<form>Expedição <input name="exp"><input type="submit" name="b" value="Buscar"><input type="submit" name="i" value="Iniciar Separação"></form>'), null);
});

test('busca por script (buscar-separacoes-ajax): JSON em formatos diferentes', () => {
  const { lerSeparacoesJson, separacaoDaExpedicao } = require('../src/wms');
  const a = lerSeparacoesJson({ sucesso: true, dados: [{ id: 44237, equipe: [{ cpf: '22082686795', nome: 'DANILO FERREIRA' }], cliente: { nome: 'LOJA X' },
    expedicoes: '83381, 83383', dataInicio: '19/11/2026 15:19:22', dataFinalizacao: '19/11/2026 18:44:30', status: 'FINALIZADA' }] });
  assert.deepStrictEqual(separacaoDaExpedicao(a.linhas, '83383'), { separador: 'DANILO FERREIRA', sep_inicio: '2026-11-19 15:19:22', sep_fim: '2026-11-19 18:44:30', status: 'FINALIZADA' });
  // Outro formato: lista direta, equipe em texto com o CPF, expedições em lista de objetos, datas ISO.
  const b = lerSeparacoesJson([{ EQUIPE: '(22082686795) DANILO FERREIRA', EXPEDICOES: [{ ID_EXPEDICAO: 83383 }], DTH_INICIO: '2026-11-19 15:19:22', DTH_FINAL: null, STATUS: 'EM ANDAMENTO' }]);
  assert.deepStrictEqual(b.linhas[0].separadores, ['DANILO FERREIRA']);
  assert.strictEqual(b.linhas[0].fim, null);
  assert.strictEqual(separacaoDaExpedicao(b.linhas, '83383').sep_fim, null);
  assert.ok(!JSON.stringify([a.linhas, b.linhas]).includes('22082686795'), 'o CPF não é guardado');
  assert.ok(!a.linhas[0].separadores.includes('LOJA X'), 'nome do cliente não vira separador');
});
