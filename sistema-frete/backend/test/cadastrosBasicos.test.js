// Cadastros básicos: conferência dos campos e vencimentos das condições de pagamento.
const test = require('node:test');
const assert = require('node:assert');
const cb = require('../src/cadastrosBasicos');
const campo = (tipo, nome) => cb.DEFS[tipo].campos.find((c) => c.nome === nome);

test('campos: documento, CFOP, UF, faixa de CEP, cidades e parcelas', () => {
  assert.strictEqual(cb.lerValor(campo('fornecedores', 'documento'), '11.222.333/0001-81'), '11222333000181');
  assert.throws(() => cb.lerValor(campo('ajudantes', 'cpf'), '11.222.333/0001-81'), /CPF com 11/);
  assert.throws(() => cb.lerValor(campo('tipos_operacao', 'cfop_estadual'), '535'), /CFOP/);
  assert.strictEqual(cb.lerValor(campo('tipos_operacao', 'cfop_estadual'), '5353'), '5353');
  assert.deepStrictEqual(cb.lerValor(campo('regioes_atendimento', 'ufs'), 'sp, rj  mg'), ['SP', 'RJ', 'MG']);
  assert.throws(() => cb.lerValor(campo('regioes_atendimento', 'ufs'), 'SP, XX'), /UF inválida/);
  assert.deepStrictEqual(cb.lerValor(campo('regioes_atendimento', 'ceps'), '01000-000 a 05999-999\n13010000'), ['01000000-05999999', '13010000-13010000']);
  assert.throws(() => cb.lerValor(campo('regioes_atendimento', 'ceps'), '05999-999 a 01000-000'), /Faixa de CEP/);
  assert.deepStrictEqual(cb.lerValor(campo('regioes_atendimento', 'cidades'), 'Campinas/sp\nsantos - SP'), ['CAMPINAS/SP', 'SANTOS/SP']);
  assert.deepStrictEqual(cb.lerValor(campo('condicoes_pagamento', 'parcelas'), '60, 30 / 90'), [30, 60, 90]);
  assert.throws(() => cb.lerValor(campo('condicoes_pagamento', 'parcelas'), '30, -1'), /dias inteiros/);
  assert.throws(() => cb.lerValor(campo('fornecedores', 'razao_social'), ' '), /Preencha/);
  assert.throws(() => cb.lerValor(campo('conjuntos_veiculo', 'reboques'), [1, 2, 3, 4]), /no máximo 3/);
});

test('vencimentos de uma condição de pagamento', () => {
  assert.deepStrictEqual(cb.vencimentos([30, 60, 90], '2026-01-31'), ['2026-03-02', '2026-04-01', '2026-05-01']);
  assert.deepStrictEqual(cb.vencimentos([0], '2026-11-08'), ['2026-11-08']);
});
