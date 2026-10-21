// Parceiros: área atendida (UFs e cidades), custo previsto pela tabela e o sinal da conta-corrente.
const test = require('node:test');
const assert = require('node:assert');
const { lerParceiro, cidadeChave, custoPrevisto, TIPOS } = require('../src/parceiros');

test('Parceiros: cadastro lê UFs e cidades (Cidade/UF ou Cidade - UF) e confere o documento', () => {
  const p = lerParceiro({ documento: '11.444.777/0001-61', nome: 'Agente', ufs: 'rj, XX, MG', cidades: 'Juiz de Fora/mg\nVolta Redonda - RJ\nsem uf\nSão João del-Rei/MG' });
  assert.deepStrictEqual(p.ufs, ['RJ', 'MG']);
  assert.deepStrictEqual(p.cidades, ['JUIZ DE FORA/MG', 'VOLTA REDONDA/RJ', 'SAO JOAO DEL-REI/MG']);
  assert.strictEqual(cidadeChave('São Paulo', 'sp'), 'SAO PAULO/SP');
  assert.throws(() => lerParceiro({ documento: '123', nome: 'x' }), /inválido/);
  assert.throws(() => lerParceiro({ documento: '11444777000161', nome: 'x', custo_percentual: '150' }), /0 a 100/);
});

test('Parceiros: custo previsto (fixo + % do frete + R$/kg, com mínimo) e o sinal dos lançamentos', () => {
  assert.strictEqual(custoPrevisto({ custo_percentual: 40, custo_minimo: 80 }, { frete: 300 }), 120);
  assert.strictEqual(custoPrevisto({ custo_percentual: 40, custo_minimo: 80 }, { frete: 100 }), 80);
  assert.strictEqual(custoPrevisto({ custo_fixo: 50, custo_kg: 0.12 }, { frete: 0, peso: 1000 }), 170);
  assert.strictEqual(TIPOS.custo.sinal, 1);
  assert.strictEqual(TIPOS.pagamento.sinal, -1);
  assert.strictEqual(TIPOS.frete_recebido.sinal, -1);
});
