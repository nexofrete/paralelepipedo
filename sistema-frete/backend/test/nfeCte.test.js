// NF-e × CT-e: conferência campo a campo do CT-e com as notas dele.
const test = require('node:test');
const assert = require('node:assert');
const { conferir, numerosDasChaves } = require('../src/nfeCte');

const nota = (o = {}) => ({ valor_faturado: 5000, peso_kg: 100, cliente_documento: '33.444.555/0001-66', cidade: 'Campinas', uf: 'SP', ...o });
const cte = (o = {}) => ({ valor_carga: 20000, peso_kg: 1000, destinatario_doc: '33444555000166', destinatario_nome: 'ATACADO', cidade_fim: 'CAMPINAS', uf_fim: 'SP', ...o });

test('CT-e que leva três notas confere com a soma delas', () => {
  const notas = [nota(), nota({ valor_faturado: 7000, peso_kg: 300 }), nota({ valor_faturado: 8000, peso_kg: 600 })];
  assert.deepStrictEqual(conferir(cte(), notas), []);
});

test('aponta valor, peso, destinatário e cidade diferentes', () => {
  const p = conferir(cte({ valor_carga: 4100, peso_kg: 450, destinatario_doc: '11999888000177', cidade_fim: 'SANTOS' }), [nota({ valor_faturado: 3000, peso_kg: 200 })]);
  assert.deepStrictEqual(p.map((x) => x.codigo), ['VALOR', 'PESO', 'DESTINATARIO', 'CIDADE']);
  assert.ok(p.find((x) => x.codigo === 'DESTINATARIO').suspeito);
});

test('tolerância: centavos e pouca diferença de peso passam; redespacho termina na cidade do redespacho', () => {
  assert.deepStrictEqual(conferir(cte({ valor_carga: 5000.6, peso_kg: 103 }), [nota()]), []);
  assert.deepStrictEqual(conferir(cte({ valor_carga: 5000, peso_kg: 100, cidade_fim: 'Jundiaí' }), [nota({ cidade_redespacho: 'JUNDIAI', redespacho: 'X' })]), []);
});

test('número da NF sai da chave (posições 26 a 34)', () => {
  assert.deepStrictEqual(numerosDasChaves(['35261044555666000199550010000700011000700017']), ['70001']);
});
