// Armazém: rateio das medidas da nota, saída FEFO/FIFO, medidas proporcionais e o valor do mês.
const test = require('node:test');
const assert = require('node:assert');
const { repartir, alocar, proporcional, calcular, diasDoMes } = require('../src/armazem');

test('Armazém: peso/paletes da nota repartidos pelo valor, fechando a soma', () => {
  assert.deepStrictEqual(repartir(10, [18000, 12000]), [6, 4]);
  const r = repartir(100, [1, 1, 1]);
  assert.strictEqual(Math.round(r.reduce((s, x) => s + x, 0) * 100) / 100, 100);
  assert.deepStrictEqual(repartir(3, [0, 0, 0]), [1, 1, 1]);
  assert.deepStrictEqual(repartir(0, [5, 5]), [0, 0]);
});

test('Armazém: saída por produto pega primeiro o que vence antes, depois o mais antigo', () => {
  const lotes = [{ id: 1, saldo: 30, validade: null }, { id: 2, saldo: 30, validade: '2026-11-10' }, { id: 3, saldo: 10, validade: '2026-12-01' }];
  assert.deepStrictEqual(alocar(lotes, 35), { itens: [{ lote_id: 2, quantidade: 30 }, { lote_id: 3, quantidade: 5 }], falta: 0 });
  assert.deepStrictEqual(alocar(lotes, 80).falta, 10);
  assert.deepStrictEqual(alocar([{ id: 5, saldo: 4 }, { id: 4, saldo: 4 }], 6).itens, [{ lote_id: 4, quantidade: 4 }, { lote_id: 5, quantidade: 2 }]);
});

test('Armazém: medidas que saem junto são proporcionais ao que entrou', () => {
  const l = { quantidade: 60, peso_kg: 1440, volume_m3: 6, volumes: 40, paletes: 6, valor: 18000 };
  assert.deepStrictEqual(proporcional(l, 30), { peso_kg: 720, volume_m3: 3, volumes: 20, paletes: 3, valor: 9000 });
});

test('Armazém: valor do mês (diárias, taxas, ad valorem e mínimo)', () => {
  const c = { base: 'palete', preco_dia: 1.2, taxa_entrada: 8, taxa_saida: 8, ad_valorem: 0.05, minimo_mes: 300 };
  // 30 dias: 10 paletes do dia 10 ao 30, saem 3 no dia 20 (fica 7 do dia 20 ao 30).
  const ocupacao = Array.from({ length: 30 }, (_, i) => { const d = i + 1; const oc = d < 10 ? 0 : d < 20 ? 10 : 7; return { dia: d, ocupacao: oc, valor: oc * 3000 }; });
  const m = calcular(c, { ocupacao, entradas: 10, saidas: 3, competencia: '2026-09' });
  assert.strictEqual(m.unidades_dia, 177);
  assert.strictEqual(m.armazenagem, 212.4);
  assert.strictEqual(m.taxa_entrada, 80);
  assert.strictEqual(m.taxa_saida, 24);
  assert.strictEqual(m.total, m.soma);
  const pouco = calcular(c, { ocupacao: ocupacao.map((d) => ({ ...d, ocupacao: d.dia === 30 ? 1 : 0, valor: 0 })), competencia: '2026-09' });
  assert.strictEqual(pouco.total, 300);   // abaixo do mínimo
  assert.strictEqual(calcular(c, { ocupacao: ocupacao.map((d) => ({ ...d, ocupacao: 0, valor: 0 })), competencia: '2026-09' }).total, 0);   // nada guardado: não cobra o mínimo
  assert.strictEqual(diasDoMes('2026-02'), 28);
});
