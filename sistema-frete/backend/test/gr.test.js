// Gerenciamento de risco: situação da liberação e o simulador da gerenciadora.
const test = require('node:test');
const assert = require('node:assert');
const { situacaoDa } = require('../src/gr/gr');
const { PROVEDORES } = require('../src/gr/provedores');

test('GR: liberação vigente, vencida, negada, em análise e sem consulta', () => {
  assert.strictEqual(situacaoDa(null).situacao, 'sem_consulta');
  assert.strictEqual(situacaoDa({ status: 'liberado', validade: '2999-12-31' }).situacao, 'liberado');
  assert.strictEqual(situacaoDa({ status: 'liberado', validade: '2000-01-01' }).situacao, 'vencida');
  assert.match(situacaoDa({ status: 'negado', motivo: 'CNH vencida.' }).texto, /negado.*CNH vencida/);
  assert.strictEqual(situacaoDa({ status: 'pendente' }).situacao, 'pendente');
});

test('GR simulador: CNH vencida nega, sem CNH fica em análise, sem RENAVAM fica em análise', async () => {
  const s = PROVEDORES.simulador;
  assert.strictEqual((await s.consultarMotorista({ cpf: '52998224725', cnh: '123', cnh_validade: '2999-01-01' })).status, 'liberado');
  assert.strictEqual((await s.consultarMotorista({ cpf: '52998224725', cnh: '123', cnh_validade: '2000-01-01' })).status, 'negado');
  assert.strictEqual((await s.consultarMotorista({ cpf: '52998224725' })).status, 'pendente');
  assert.strictEqual((await s.consultarVeiculo({ placa: 'ABC1D23', renavam: '12345678901' })).status, 'liberado');
  assert.strictEqual((await s.consultarVeiculo({ placa: 'ABC1D23' })).status, 'pendente');
  assert.match((await s.enviarSM({})).numero, /^SM\d{9}$/);
  for (const id of ['buonny', 'telerisco', 'opentech', 'tecnorisk']) await assert.rejects(PROVEDORES[id].enviarSM({}), (e) => e.status === 501);
});
