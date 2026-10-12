const test = require('node:test');
const assert = require('node:assert');
const { mensagem, destinatarios, celular } = require('../../src/cte/avisosEntrega');

test('WhatsApp só para celular brasileiro (+55 DDD 9xxxx-xxxx)', () => {
  assert.strictEqual(celular('(21) 99876-5432'), '+5521998765432');
  assert.strictEqual(celular('+55 11 91234-5678'), '+5511912345678');
  assert.strictEqual(celular('021 3333-4444'), null);
  assert.strictEqual(celular(''), null);
});

test('avisa destinatário e tomador sem repetir', () => {
  const d = { tomador: '0', remetente: { email: 'Compras@Ind.com', fone: '1133334444' }, destinatario: { email: 'loja@x.com', fone: '21987654321' } };
  assert.deepStrictEqual(destinatarios(d), { emails: ['loja@x.com', 'compras@ind.com'], fones: ['+5521987654321'] });
  assert.deepStrictEqual(destinatarios({ ...d, tomador: '3' }), { emails: ['loja@x.com'], fones: ['+5521987654321'] });
});

test('mensagem de entrega traz NF, quem recebeu e o link', () => {
  const cte = { serie: 1, numero: 9, dados: { destinatario: { xNome: 'FARMACIA' }, nfes: ['35261044555666000199550010000012341000000006'] } };
  const m = mensagem({ tipo: 'entrega', descricao: 'Entregue', data_hora: '2026-10-12T15:30:00', cidade: 'RIO DE JANEIRO', uf: 'RJ', recebedor_nome: 'José' },
    cte, { nome_fantasia: 'TESTE LOG' }, 'https://x/rastreio.html?chave=1');
  assert.strictEqual(m.titulo, 'Entrega realizada');
  assert.match(m.texto, /NF 1234/);
  assert.match(m.texto, /Recebido por José/);
  assert.match(m.texto, /Acompanhe: https:\/\/x\/rastreio/);
  assert.match(m.assunto, /TESTE LOG · NF 1234/);
});
