// Relatórios operacionais (src/relatoriosOperacional.js): NF-e × pré-nota e a origem do CT-e.
const test = require('node:test');
const assert = require('node:assert');
const { divergencias, origemCte } = require('../src/relatoriosOperacional');

test('NF-e × pré-nota: valor, volumes, peso (2%), transportadora (nome parecido vale), destino e cliente', () => {
  const n = { valor: 1000, volumes: 4, peso: 100, transportadora: 'TRANSP ALFA LTDA', cidade: 'Pelotas', uf: 'RS', cliente_documento: '11.222.333/0001-81' };
  assert.deepStrictEqual(divergencias(n, { valor_faturado: 1000, qtd_volumes: 4, peso_kg: 101, transportadora: 'Transp. Alfa', cidade: 'PELOTAS', uf: 'rs', cliente_documento: '11222333000181' }), []);
  assert.deepStrictEqual(divergencias(n, { valor_faturado: 950, qtd_volumes: 5, peso_kg: 110, transportadora: 'BETA', cidade: 'Rio Grande', uf: 'RS', cliente_documento: '99' }),
    ['valor', 'volumes', 'peso', 'transportadora', 'destino', 'cliente']);
  assert.deepStrictEqual(divergencias(n, {}), [], 'pré-nota sem o campo não acusa diferença');
});

test('origem do CT-e pelo usuário que importou', () => {
  assert.strictEqual(origemCte(5, 'Ana'), 'Envio manual');
  assert.strictEqual(origemCte(null, 'Leitura automática de e-mail'), 'E-mail');
  assert.strictEqual(origemCte(null, 'SEFAZ (busca automática de CT-e)'), 'SEFAZ (DF-e)');
  assert.strictEqual(origemCte(null, 'Importação automática (pasta)'), 'Pasta de XML');
});
