// Parceiros: tabela de frete por região/peso e o resumo de desempenho (pontualidade e nota).
const test = require('node:test');
const assert = require('node:assert');
const { regra, previsto, resumir } = require('../src/parceiros');

const p = { custo_percentual: 40, custo_kg: 0, custo_fixo: 0, custo_minimo: 0, prazo_dias: 1 };
const linhas = [
  { uf: 'RJ', cidade: null, peso_ate: 100, custo_percentual: 0, custo_kg: 0, custo_fixo: 80, custo_minimo: 90, prazo_dias: 2 },
  { uf: 'RJ', cidade: null, peso_ate: null, custo_percentual: 35, custo_kg: 0, custo_fixo: 0, custo_minimo: 100, prazo_dias: 3 },
  { uf: 'RJ', cidade: 'RIO DE JANEIRO/RJ', peso_ate: null, custo_percentual: 30, custo_kg: 0, custo_fixo: 0, custo_minimo: 0, prazo_dias: 1 },
];

test('a linha da cidade vale antes da do estado', () => {
  const r = previsto(p, linhas, { frete: 500, peso: 50, cidade: 'Rio de Janeiro', uf: 'RJ' });
  assert.deepStrictEqual([r.valor, r.prazo_dias, r.origem], [150, 1, 'tabela']);
});

test('no estado, a menor faixa de peso que cabe', () => {
  assert.strictEqual(previsto(p, linhas, { frete: 500, peso: 80, cidade: 'Niterói', uf: 'RJ' }).valor, 90);   // fixo 80, mínimo 90
  const pesado = previsto(p, linhas, { frete: 500, peso: 300, cidade: 'Niterói', uf: 'RJ' });
  assert.deepStrictEqual([pesado.valor, pesado.prazo_dias], [175, 3]);
});

test('destino sem linha usa o custo do cadastro', () => {
  const r = regra(p, linhas, { cidade: 'Vitória', uf: 'ES', peso: 10 });
  assert.strictEqual(r.origem, 'cadastro');
  assert.strictEqual(previsto(p, linhas, { frete: 100, cidade: 'Vitória', uf: 'ES' }).valor, 40);
});

test('pontualidade conta as entregues e as em aberto já atrasadas', () => {
  const r = resumir([
    { situacao_entrega: 'entregue', entregue_em: '2026-10-10', prometido: '2026-10-10' },
    { situacao_entrega: 'entregue', entregue_em: '2026-10-14', prometido: '2026-10-10' },
    { situacao_entrega: 'em_transito', prometido: '2026-10-01' },
    { situacao_entrega: 'em_transito', prometido: '2026-12-31' },
    { situacao_entrega: 'devolvido', prometido: '2026-10-01', problemas: 1 },
  ], [5, 3], '2026-11-01');
  assert.strictEqual(r.pontualidade, 33.3);
  assert.strictEqual(r.atraso_medio, 4);
  assert.deepStrictEqual([r.entregues, r.abertas, r.abertas_atrasadas, r.devolvidas, r.problemas], [2, 2, 1, 1, 1]);
  assert.strictEqual(r.nota_media, 4);
  assert.strictEqual(r.nota_geral, 2.8);   // (33,3% → 1,67 + 4) ÷ 2
});
