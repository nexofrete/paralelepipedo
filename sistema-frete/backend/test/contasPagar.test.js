// Contas a pagar (parcelas) e acerto de viagem (saldo, impostos do autônomo, custos da viagem).
const test = require('node:test');
const assert = require('node:assert');
const cp = require('../src/contasPagar');
const ac = require('../src/acertos');

test('parcelas: mesmo dia nos meses seguintes e centavos na 1ª', () => {
  assert.strictEqual(cp.somarMeses('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(cp.somarMeses('2026-11-15', 2), '2027-01-15');
  const p = cp.parcelar(cp.lerConta({ descricao: 'Pneus', vencimento: '2026-01-31', valor: '10.000,00', parcelas: 3 }));
  assert.deepStrictEqual(p.map((x) => [x.parcela, x.vencimento, x.valor]), [['1/3', '2026-01-31', 3333.34], ['2/3', '2026-02-28', 3333.33], ['3/3', '2026-03-31', 3333.33]]);
  const fixo = cp.parcelar(cp.lerConta({ descricao: 'Aluguel', vencimento: '2026-01-10', valor: 2500, parcelas: 2, dividir: false }));
  assert.deepStrictEqual(fixo.map((x) => x.valor), [2500, 2500]);
  assert.throws(() => cp.lerConta({ descricao: '', vencimento: '2026-01-10', valor: 1 }), /descrição/);
  assert.throws(() => cp.lerConta({ descricao: 'x', vencimento: '', valor: 1 }), /vencimento/);
  assert.throws(() => cp.lerConta({ descricao: 'x', vencimento: '2026-01-10', valor: 0 }), /valor/);
});

test('autônomo (TAC): INSS 11% e SEST/SENAT 2,5% sobre 20% do frete', () => {
  assert.deepStrictEqual(ac.impostosTac(5000), { base: 1000, inss: 110, sest_senat: 25 });
  const a = ac.lerAcerto({ tipo: 'terceiro', motorista_nome: 'João', valor_frete: '5.000,00', adiantamento: '2000', reter_impostos: true });
  assert.deepStrictEqual([a.inss, a.sest_senat, a.proprietario_nome], [110, 25, 'João']);
  // Sem retenção (empresa ou agregado PJ), os impostos ficam zerados.
  assert.strictEqual(ac.lerAcerto({ tipo: 'terceiro', motorista_nome: 'J', valor_frete: 100, inss: 50 }).inss, 0);
  assert.throws(() => ac.lerAcerto({ tipo: 'terceiro', motorista_nome: 'J', valor_frete: 100, adiantamento: 200 }), /adiantamento/);
  assert.throws(() => ac.lerAcerto({ tipo: 'terceiro', motorista_nome: 'J' }), /frete/);
});

test('acerto do terceiro: frete ± ajustes − impostos − adiantamento; custo da viagem', () => {
  const a = { tipo: 'terceiro', valor_frete: 5000, adiantamento: 2000, inss: 110, sest_senat: 25, irrf: 0, vale_pedagio_valor: 320.5 };
  const l = [{ tipo: 'desconto', valor: 150, categoria: 'avaria' }, { tipo: 'acrescimo', valor: 250, categoria: 'estadia' }];
  const t = ac.calcular(a, l);
  assert.deepStrictEqual([t.bruto, t.impostos, t.saldo], [5100, 135, 2965]);
  assert.deepStrictEqual(ac.custosDoMdfe(a, l), { combustivel: 0, pedagio: 320.5, motorista: 0, terceiro: 5100, outros: 0 });
});

test('acerto do motorista próprio: despesas − adiantamento (negativo = devolve)', () => {
  const a = { tipo: 'proprio', adiantamento: 1500, vale_pedagio_valor: 0 };
  const l = [['combustivel', 1180.4], ['pedagio', 210], ['alimentacao', 160], ['hospedagem', 120], ['manutencao', 50]].map(([categoria, valor]) => ({ tipo: 'despesa', categoria, valor }));
  assert.strictEqual(ac.calcular(a, l).saldo, 220.4);
  assert.deepStrictEqual(ac.custosDoMdfe(a, l), { combustivel: 1180.4, pedagio: 210, motorista: 280, terceiro: 0, outros: 50 });
  assert.strictEqual(ac.calcular({ ...a, adiantamento: 2000 }, l).saldo, -279.6);
});

test('competência: compra parcelada fica toda no mês dela; conta que se repete vai mês a mês', () => {
  const base = { descricao: 'x', valor: 300, vencimento: '2026-10-10', competencia: '2026-09-25', parcelas: 3 };
  const compra = cp.parcelar(cp.lerConta({ ...base, dividir: true }));
  assert.deepStrictEqual(compra.map((p) => p.competencia), ['2026-09-25', '2026-09-25', '2026-09-25']);
  const aluguel = cp.parcelar(cp.lerConta({ ...base, dividir: false }));
  assert.deepStrictEqual(aluguel.map((p) => p.competencia), ['2026-09-25', '2026-10-25', '2026-11-25']);
  assert.strictEqual(cp.parcelar(cp.lerConta({ ...base, competencia: '', parcelas: 1 }))[0].competencia, null);   // vazio = hoje (no banco)
});
