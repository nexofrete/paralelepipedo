// Fiscal e contabilidade: planilha de lançamentos, livro, período e ICMS sem base.
const test = require('node:test');
const assert = require('node:assert');
const { csvLancamentos, csvLivro, livroHtml, mesAnterior, periodo } = require('../src/contabil');
const { completarIcms } = require('../src/cte/emissao');

const lanc = { linhas: [
  { data: '2026-10-10', debito: '1.1.2.01', credito: '3.1.1.01', valor: 475.5, historico: 'CT-e 1/2 — Móveis "Bons"; SA', documento: 'CT-e 1/2', participante: '44555666000199' },
] };

test('contabil: planilha de lançamentos no padrão brasileiro (;) com campo escapado', () => {
  const csv = csvLancamentos(lanc, ';');
  assert.ok(csv.startsWith('﻿Data;Conta débito;Conta crédito;Valor;'));
  assert.ok(csv.includes('10/10/2026;1.1.2.01;3.1.1.01;475,50;"CT-e 1/2 — Móveis ""Bons""; SA";CT-e 1/2;44555666000199\r\n'));
});

test('contabil: separador vírgula usa ponto decimal; tabulação também', () => {
  assert.ok(csvLancamentos(lanc, ',').includes(',475.50,'));
  assert.ok(csvLancamentos(lanc, 'tab').includes('\t475,50\t'));
});

test('contabil: livro em planilha e HTML (com escape)', () => {
  const l = {
    periodo: { de: '2026-10-01', ate: '2026-10-31' }, nfse: [],
    ctes: [{ data: '2026-10-10', serie: 1, numero: 2, chave: '35', situacao: 'autorizado', tipo: 'normal', cfop: '6353', cst: '00', aliquota: 12, uf_ini: 'SP', uf_fim: 'RJ', tomador_nome: '<Cliente>', tomador_doc: '1', valor: 100, valor_original: 100, base: 100, icms: 12, isentas_outras: 0 }],
    por_cfop: [{ chave: '6353', qtd: 1, valor: 100, base: 100, icms: 12, isentas_outras: 0 }], por_cst: [], por_uf: [],
    totais: { ctes: 1, cancelados: 0, substituidos: 0, valor: 100, base: 100, icms: 12, isentas_outras: 0, nfse: 0, demonstracao: false },
  };
  assert.ok(csvLivro(l).includes('10/10/2026;1;2;35;autorizado;normal;6353;00;12,00;SP;RJ;<Cliente>;1;100,00;100,00;12,00;0,00;'));
  // Nome que parece fórmula vira texto; ajuste de mês anterior sai negativo.
  const l2 = { ...l, ctes: [{ ...l.ctes[0], tomador_nome: '=HYPERLINK("x")' }], ajustes: [{ tipo: 'cte', documento: 'CT-e 1/1', chave: '35', data: '2026-10-05', data_original: '2026-09-20', motivo: 'cancelado', tomador_nome: 'A;B', tomador_doc: '2', valor: 50, icms: 6 }] };
  const csv = csvLivro(l2);
  assert.ok(csv.includes(`;"'=HYPERLINK(""x"")";`));
  assert.ok(csv.includes('05/10/2026;;CT-e 1/1;35;ajuste: cancelado;cte;;;;;;"A;B";2;-50,00;;-6,00;;emitido em 20/09/2026'));
  const h = livroHtml(l, { razao_social: 'Transp & Cia', cnpj: '1' });
  assert.ok(h.includes('Transp &amp; Cia') && h.includes('&lt;Cliente&gt;') && !h.includes('<Cliente>'));
});

test('contabil: período padrão é o mês anterior; período invertido ou longo é recusado', () => {
  assert.deepStrictEqual(mesAnterior(new Date(Date.UTC(2026, 0, 15))), { de: '2025-12-01', ate: '2025-12-31' });
  assert.deepStrictEqual(mesAnterior(new Date(Date.UTC(2026, 2, 1))), { de: '2026-02-01', ate: '2026-02-28' });
  assert.throws(() => periodo({ de: '2026-10-31', ate: '2026-10-01' }), /depois da final/);
  assert.throws(() => periodo({ de: '2024-01-01', ate: '2026-01-01' }), /1 ano/);
  assert.deepStrictEqual(periodo({ de: '2026-10-01', ate: '2026-10-31' }), { de: '2026-10-01', ate: '2026-10-31' });
});

test('CT-e: ICMS tributado sem base é calculado antes de assinar', () => {
  assert.deepStrictEqual(completarIcms({ icms: { cst: '00', pICMS: 12 }, valores: { vTPrest: 300 } }).icms, { cst: '00', pICMS: 12, vBC: 300, vICMS: 36 });
  assert.deepStrictEqual(completarIcms({ icms: { cst: '20', pICMS: 12, pRedBC: 20 }, valores: { vTPrest: 100 } }).icms, { cst: '20', pICMS: 12, pRedBC: 20, vBC: 80, vICMS: 9.6 });
  assert.strictEqual(completarIcms({ icms: { cst: '00', pICMS: 12, vBC: 300, vICMS: 36 } }), null);   // já tem
  assert.strictEqual(completarIcms({ icms: { cst: '40' }, valores: { vTPrest: 100 } }), null);        // isento
  assert.strictEqual(completarIcms({ icms: { cst: '00' }, valores: { vTPrest: 100 } }), null);        // sem alíquota: a SEFAZ/validação apontam
});
