const test = require('node:test');
const assert = require('node:assert');
const { separar, lerMapaDaLinha, mesma, situacao } = require('../src/transportadoraMapa');

test('separa o nome e o CNPJ da transportadora do mapa', () => {
  assert.deepStrictEqual(separar('ANDRADE E ABREU TRAS LTDA CNPJ:09.318.444/0002-25'), { nome: 'ANDRADE E ABREU TRAS LTDA', cnpj: '09318444000225' });
  assert.deepStrictEqual(separar('TRANSP XYZ - CNPJ 12345678000190'), { nome: 'TRANSP XYZ', cnpj: '12345678000190' });
  assert.deepStrictEqual(separar('LD RIO PIZZO Transportes.CNPJ.59.286.667/0001-45'), { nome: 'LD RIO PIZZO Transportes', cnpj: '59286667000145' });
  assert.deepStrictEqual(separar('RODONAVES'), { nome: 'RODONAVES', cnpj: null });
  assert.deepStrictEqual(separar(''), { nome: null, cnpj: null });
});

test('colunas do mapa no lugar certo', () => {
  const m = lerMapaDaLinha({ DS_MAPA_CARREGAMENTO: 'ROTA SUL', TRANSPORTADORA_MAPA: 'BRASPRESS CNPJ:48.740.351/0001-65', AJUDANTE_1_MAPA: 'JOAO :RG:123' });
  assert.strictEqual(m.deslocado, false);
  assert.strictEqual(m.mapa_transportadora, 'BRASPRESS');
  assert.strictEqual(m.mapa_transportadora_cnpj, '48740351000165');
  assert.strictEqual(m.mapa_ajudante, 'JOAO :RG:123');
  assert.strictEqual(m.mapa_descricao, 'ROTA SUL');
});

test('exportação com as colunas do fim deslocadas uma casa', () => {
  const m = lerMapaDaLinha({
    DS_MAPA_CARREGAMENTO: 'ANDRADE E ABREU TRAS LTDA CNPJ:09.318.444/0002-25', TRANSPORTADORA_MAPA: 'LUCAS DE OLIVEIRA :RG:192620707-64',
    AJUDANTE_1_MAPA: 'DATA:07/01/26 HORA:17:30', DT_SAIDA_MAPA: '',
  });
  assert.strictEqual(m.deslocado, true);
  assert.strictEqual(m.mapa_transportadora, 'ANDRADE E ABREU TRAS LTDA');
  assert.strictEqual(m.mapa_transportadora_cnpj, '09318444000225');
  assert.strictEqual(m.mapa_ajudante, 'LUCAS DE OLIVEIRA :RG:192620707-64');
});

test('mesma transportadora: CNPJ (raiz) e nome escrito diferente', () => {
  assert.strictEqual(mesma({ cnpj: '09318444000225' }, { cnpj: '09318444000144' }), true);
  assert.strictEqual(mesma({ cnpj: '09318444000225' }, { cnpj: '48740351000165' }), false);
  assert.strictEqual(mesma({ nome: 'ANDRADE E ABREU TRANSPORTES LTDA' }, { nome: 'ANDRADE E ABREU TRAS LTDA' }), true);
  assert.strictEqual(mesma({ nome: 'BRASPRESS TRANSPORTES URGENTES' }, { nome: 'ANDRADE E ABREU TRAS LTDA' }), false);
  assert.strictEqual(mesma({ nome: null }, { nome: 'X' }), null);
});

test('situação: NF-e, mapa e CT-e', () => {
  const A = { nome: 'ANDRADE E ABREU TRANSPORTES LTDA' }; const Am = { nome: 'ANDRADE E ABREU TRAS LTDA', cnpj: '09318444000225' };
  const B = { nome: 'BRASPRESS', cnpj: '48740351000165' };
  assert.strictEqual(situacao({ nf: A, mapa: Am, cte: { nome: 'ANDRADE E ABREU TRANSPORTES LTDA', cnpj: '09318444000144' } }), 'Confere');
  assert.strictEqual(situacao({ nf: A, mapa: Am, cte: B }), 'CT-e de outra transportadora');
  assert.strictEqual(situacao({ nf: { nome: 'BRASPRESS' }, mapa: Am, cte: {} }), 'Saiu por outra; aguardando CT-e');
  assert.strictEqual(situacao({ nf: { nome: 'BRASPRESS' }, mapa: Am, cte: { cnpj: '09318444000144' } }), 'Saiu por outra; CT-e confere');
  assert.strictEqual(situacao({ nf: A, mapa: Am, cte: {} }), 'Aguardando CT-e');
});
