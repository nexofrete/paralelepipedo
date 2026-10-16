const test = require('node:test');
const assert = require('node:assert');
const { lerItem, dataDe } = require('../src/rastreioLdrio');

test('ldrio: datas do Supabase viram o dia em Brasília', () => {
  assert.strictEqual(dataDe('2026-10-16'), '2026-10-16');
  assert.strictEqual(dataDe('16/10/2026'), '2026-10-16');
  assert.strictEqual(dataDe('2026-10-17T01:30:00+00:00'), '2026-10-16'); // 22h30 de 16/10 em Brasília
  assert.strictEqual(dataDe('2026-10-16T22:30:00'), '2026-10-16');
  assert.strictEqual(dataDe(''), null);
  assert.strictEqual(dataDe('ontem'), null);
});

test('ldrio: lê NF, chave e entrega com nomes de coluna variados', () => {
  const chave = '35261044555666000199550010001938581000000001';
  const a = lerItem({ id: 'x', numero_nf: '000193858', data_entrega: '2026-10-16T14:05:00+00:00', status: 'Entregue', criado_em: '2026-10-14T10:00:00+00:00', canhoto_url: 'https://x/y.jpg' });
  assert.strictEqual(a.nf, '193858'); assert.strictEqual(a.entrega, '2026-10-16'); assert.strictEqual(a.horaEntrega, '11:05'); assert.strictEqual(a.canhoto, true);
  const b = lerItem({ nf: 193857, entregue_em: null, situacao: 'Em andamento', chave_nfe: chave });
  assert.strictEqual(b.nf, '193857'); assert.strictEqual(b.entrega, null); assert.strictEqual(b.chave, chave);
  // Só a chave (em coluna de nome desconhecido): a NF sai dela.
  const c = lerItem({ documento: chave, dt_entrega: '16/10/2026' });
  assert.strictEqual(c.chave, chave); assert.strictEqual(c.nf, '193858'); assert.strictEqual(c.entrega, '2026-10-16');
});
