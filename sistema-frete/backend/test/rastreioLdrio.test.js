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

test('ldrio: colunas com nomes fora da lista (entrega, NF e CT-e) também são lidas', () => {
  const a = lerItem({ id: 7, nota_fiscal_numero: '193892', numero_do_cte: '4896', entrega_data: '2026-10-19T17:00:00+00:00', previsao_entrega: '2026-10-17', status: 'Entregue' });
  assert.strictEqual(a.nf, '193892'); assert.strictEqual(a.cte, '4896'); assert.strictEqual(a.entrega, '2026-10-19');
  // Previsão / prazo não contam como entrega.
  assert.strictEqual(lerItem({ nf: '1', previsao_entrega: '2026-10-17', status: 'Em rota' }).entrega, null);
});

test('ldrio: casa pela chave, pelo CT-e e pela NF, perto da data do CT-e', () => {
  const { casar } = require('../src/rastreioLdrio');
  const n1 = { id: 1, numero_nf: '193892', numero_cte: '4896', chave_nfe: null, referencia: '2026-10-15' };
  const n2 = { id: 2, numero_nf: '500', numero_cte: '4896', chave_nfe: null, referencia: '2025-01-10' };
  const porChave = new Map(); const porNf = new Map([['193892', [n1]], ['500', [n2]]]); const porCte = new Map([['4896', [n1, n2]]]);
  // A NF veio diferente no portal (ex.: com série), mas o CT-e e a data batem.
  assert.strictEqual(casar({ nf: '999', cte: '4896', criado: '2026-10-19' }, porChave, porNf, porCte), n1);
  // Mesmo CT-e de outra época: não casa.
  assert.strictEqual(casar({ nf: '999', cte: '4896', criado: '2026-06-01' }, porChave, porNf, porCte), null);
  assert.strictEqual(casar({ nf: '193892', criado: '2026-10-16' }, porChave, porNf, porCte), n1);
});
