// Acesso por usuário: módulo de cada rota, bloqueio e filtro por filial.
const test = require('node:test');
const assert = require('node:assert');
const { moduloDaRota, moduloBloqueado, paginaBloqueada, limparModulos, condicaoUnidades, unidadesDo } = require('../src/permissoes');

test('cada rota cai no módulo certo; rotas usadas por outras telas ficam livres', () => {
  assert.strictEqual(moduloDaRota('/api/frota/painel?x=1'), 'frota');
  assert.strictEqual(moduloDaRota('/api/cte-emissao/12/dacte'), 'operacao');
  assert.strictEqual(moduloDaRota('/api/bancos/conciliacao'), 'bancos');
  assert.strictEqual(moduloDaRota('/api/bancos/contas/opcoes'), null);
  assert.strictEqual(moduloDaRota('/api/fretes'), null);
  assert.strictEqual(moduloDaRota('/api/frotas'), null);
});

test('bloqueio vale para usuário comum, nunca para o administrador', () => {
  const u = { perfil: 'interno', modulos_bloqueados: ['frota'] };
  assert.ok(moduloBloqueado(u, 'frota'));
  assert.ok(!moduloBloqueado(u, 'bancos'));
  assert.ok(!moduloBloqueado({ ...u, perfil: 'admin' }, 'frota'));
  assert.ok(paginaBloqueada(u, 'frota'));
  assert.ok(!paginaBloqueada(u, 'emissao-cte'));
  assert.deepStrictEqual(limparModulos(['frota', 'xyz', 'frota', 'sac']), ['frota', 'sac']);
});

test('filtro por filial: sem limite não filtra; com limite inclui os documentos sem filial', () => {
  const p = [];
  assert.strictEqual(condicaoUnidades({ usuario: { perfil: 'interno', unidades_permitidas: [] } }, ['a'], p), 'TRUE');
  assert.strictEqual(unidadesDo({ usuario: { perfil: 'admin', unidades_permitidas: [3] } }), null);
  const c = condicaoUnidades({ usuario: { perfil: 'interno', unidades_permitidas: [3, 5] } }, ['x.o', 'x.d'], p);
  assert.strictEqual(c, '(x.o = ANY($1::int[]) OR x.d = ANY($1::int[]) OR (x.o IS NULL AND x.d IS NULL))');
  assert.deepStrictEqual(p, [[3, 5]]);
});
