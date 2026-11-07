// Fatura da transportadora em planilha: acha CT-e, chave, valor, número e vencimento.
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { lerPlanilha, valorAPagar } = require('../src/faturasFrete');

test('CSV com cabeçalho da fatura e vírgula decimal', () => {
  const csv = 'FATURA: F-7788;;;\nVencimento: 20/11/2026;;;\nN CT-e;Emissão;NF;Valor do frete\n00003012;10/10/2026;9001;118,50\n3013;10/10/2026;9002;1.250,00\n';
  const r = lerPlanilha(Buffer.from(csv, 'utf8'));
  assert.strictEqual(r.numero, 'F-7788');
  assert.strictEqual(r.vencimento, '2026-11-20');
  assert.deepStrictEqual(r.linhas.map((l) => [l.cte, l.valor]), [['3012', 118.5], ['3013', 1250]]);
});

test('Excel só com a chave: o número do CT-e sai da chave', () => {
  const chave = '35261011222333000181570010000045671000045678';
  const ws = XLSX.utils.aoa_to_sheet([['Chave de acesso', 'Valor cobrado'], [chave, 99.9]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'F');
  const r = lerPlanilha(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.deepStrictEqual(r.linhas, [{ cte: '4567', chave, valor: 99.9 }]);
});

test('valor a pagar: o informado na fatura, ou os CT-e menos as glosas', () => {
  assert.strictEqual(valorAPagar({ valor_informado: '500.00', valor_ctes: '520', total_glosas: '20' }), 500);
  assert.strictEqual(valorAPagar({ valor_informado: null, valor_ctes: '520', total_glosas: '20' }), 500);
});
