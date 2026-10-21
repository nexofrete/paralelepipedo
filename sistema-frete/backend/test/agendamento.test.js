// Agendamento de entrega: texto da janela, resumo sem senha para fora e as validações.
const test = require('node:test');
const assert = require('node:assert');
const ag = require('../src/cte/agendamento');

test('Agendamento: janela e resumo (com e sem senha)', () => {
  const a = { data: '2026-10-23', hora_de: '08:00', hora_ate: '12:00', senha: 'AG-1', doca: '3' };
  assert.strictEqual(ag.janela(a), '08:00 às 12:00');
  assert.strictEqual(ag.janela({ hora_de: '13:00' }), 'a partir das 13:00');
  assert.strictEqual(ag.janela({ hora_ate: '10:00' }), 'até as 10:00');
  assert.strictEqual(ag.janela({}), '');
  assert.strictEqual(ag.resumo(a), '23/10, 08:00 às 12:00 · senha AG-1 · doca 3');
  assert.strictEqual(ag.resumo(a, { comSenha: false }), '23/10, 08:00 às 12:00');
});

test('Agendamento: recusa data passada, janela invertida e hora inválida antes de mexer no banco', async () => {
  const semBanco = { query: () => { throw new Error('não deveria consultar o banco'); } };
  const agendar = (corpo) => ag.agendar(semBanco, { cteId: 1, corpo, usuarioNome: 't' });
  await assert.rejects(agendar({}), /Informe a data/);
  await assert.rejects(agendar({ data: '2000-01-01' }), /já passou/);
  await assert.rejects(agendar({ data: '2999-01-01', hora_de: '12:00', hora_ate: '08:00' }), /depois do inicial/);
  await assert.rejects(agendar({ data: '2999-01-01', hora_de: '25:00' }), /Horário inválido/);
});
