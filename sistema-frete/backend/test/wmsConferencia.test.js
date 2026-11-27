const test = require('node:test');
const assert = require('node:assert');
const { lerConferencia, lerSeparacao, lerOs } = require('../src/wms');
const { situacaoPedido } = require('../src/pedidos');

// OS fictícia no formato do Imperium: Ordens de Serviço (só a conferência, sem fim) e o histórico.
const OS = `<h4>Ordens de Serviço</h4><table><tr><th></th><th>OS</th><th>Responsavel</th><th>Atividade</th><th>Qtd.Conferida</th><th>Qtd.Conferida Transbordo</th><th>Inicio</th><th>Fim</th></tr>
<tr><td><img></td><td>343710</td><td>FULANO CONFERENTE DE TAL</td><td>CONF. EXPEDIÇÃO</td><td>23</td><td>0</td><td>26/11/2026 09:56:07</td><td></td></tr></table>
<p>Total de 26 registros encontrados.</p><h4>Andamento da expedição</h4>
<table><tr><th>Data</th><th>Usuário</th><th>Mapa</th><th>Etiqueta</th><th>Andamento</th></tr>
<tr><td>26/11/2026 10:00:25</td><td>FULANO CONFERENTE DE TAL</td><td></td><td></td><td>Conferencia finalizada com sucesso via coletor</td></tr>
<tr><td>25/11/2026 18:28:01</td><td>CICRANO IMPRESSOR</td><td></td><td></td><td>Etiquetas Impressas</td></tr></table>`;

test('conferente, início (Ordens de Serviço) e fim (histórico) da conferência', () => {
  const c = lerConferencia(OS);
  assert.strictEqual(c.conferente, 'FULANO CONFERENTE DE TAL');
  assert.strictEqual(c.conf_inicio, '2026-11-26 09:56:07');
  assert.strictEqual(c.conf_fim, '2026-11-26 10:00:25');
  // O conferente não vira separador.
  assert.strictEqual(lerSeparacao(OS).separador, null);
  const os = lerOs(OS);
  assert.strictEqual(os.usuario, 'CICRANO IMPRESSOR');
  assert.strictEqual(os.conferente, 'FULANO CONFERENTE DE TAL');
});

test('conferência com fim na própria tabela e sem conferência', () => {
  const c = lerConferencia(OS.replace('<td>26/11/2026 09:56:07</td><td></td>', '<td>26/11/2026 09:56:07</td><td>26/11/2026 10:05:00</td>'));
  assert.strictEqual(c.conf_fim, '2026-11-26 10:05:00');
  assert.deepStrictEqual(lerConferencia('<table><tr><th>Data</th><th>Usuário</th><th>Andamento</th></tr></table>'), { conferente: null, conf_inicio: null, conf_fim: null, como_conf: null });
});

test('situação pela conferência', () => {
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'EM SEPARACAO', conf_inicio: '2026-11-26 09:56' }), 'Em conferência');
  assert.strictEqual(situacaoPedido({ tem_nota: false, status_wms: 'EM SEPARACAO', conf_inicio: '2026-11-26 09:56', conf_fim: '2026-11-26 10:00' }), 'Separado');
});
