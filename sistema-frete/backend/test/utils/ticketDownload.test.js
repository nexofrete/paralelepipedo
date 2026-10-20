const test = require('node:test');
const assert = require('node:assert');
const ticket = require('../../src/ticketDownload');

const req = (url, method = 'GET') => ({ originalUrl: url, method });

test('ticket vale só para o arquivo pedido, só GET e só do tipo certo', () => {
  const t = ticket.emitir({ id: 7 }, '/api/cte-emissao/10/dacte');
  assert.strictEqual(ticket.conferir(t, req('/api/cte-emissao/10/dacte?token=x'), 'dl').id, 7);
  assert.strictEqual(ticket.conferir(t, req('/api/cte-emissao/11/dacte'), 'dl'), null);       // outro arquivo
  assert.strictEqual(ticket.conferir(t, req('/api/cte-emissao/10/dacte/x'), 'dl'), null);
  assert.strictEqual(ticket.conferir(t, req('/api/cte-emissao/10/dacte', 'POST'), 'dl'), null); // só leitura
  assert.strictEqual(ticket.conferir(t, req('/api/cte-emissao/10/dacte'), 'dl-portal'), null);  // não serve no portal
  assert.strictEqual(ticket.conferir('lixo', req('/api/cte-emissao/10/dacte'), 'dl'), null);
});

test('mapa da roteirização vale por prefixo; outros caminhos não', () => {
  const t = ticket.emitir({ id: 1 }, '/api/roteirizacao/mapa/');
  assert.ok(ticket.conferir(t, req('/api/roteirizacao/mapa/12/1/2.png'), 'dl'));
  assert.strictEqual(ticket.conferir(t, req('/api/roteirizacao/outra'), 'dl'), null);
  const comum = ticket.emitir({ id: 1 }, '/api/faturamento/');
  assert.strictEqual(ticket.conferir(comum, req('/api/faturamento/3/imprimir'), 'dl'), null);
});

test('ticket do portal e caminhos inválidos', () => {
  const t = ticket.emitir({ pid: 3, v: 2 }, '/api/portal/cte/5/xml');
  const p = ticket.conferir(t, req('/api/portal/cte/5/xml'), 'dl-portal');
  assert.deepStrictEqual([p.pid, p.v], [3, 2]);
  assert.strictEqual(ticket.conferir(t, req('/api/portal/cte/5/xml'), 'dl'), null);
  for (const c of ['', 'http://x/api/a', '/outra/a', '/api/../x', '/api//x', '/api/a b']) assert.throws(() => ticket.emitir({ id: 1 }, c), /inválido/);
});
