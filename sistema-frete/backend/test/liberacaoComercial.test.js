const test = require('node:test');
const assert = require('node:assert');
const { lerEmail, dataDoEmail } = require('../src/liberacaoComercial');

// E-mail fictício no formato do Outlook impresso em PDF.
const EMAIL = `Outlook
Pedidos Liberados 25/11 - Comercial Até 18h.
De Fulana de Tal - Comercial <vendas@exemplo.com.br>
Data Qua, 2026-11-25 17:55
Para faturamento@exemplo.com.br <faturamento@exemplo.com.br>
Boa tarde,
Segue abaixo pedidos liberados:
- Nr. Pedido: 217087 - Cliente: 48.075.660 CLIENTE UM.
- Nr. Pedido: 217132 - Cliente: CLIENTE DOIS LTDA.
- Nr. Pedido: 217132 - Cliente: CLIENTE DOIS LTDA.
- Nr. Pedido: 217251 - Cliente: CLIENTE TRES LTDA .
Obs. Caso tenha algum pedido que foi impresso e não constar na listagem acima favor me sinalizar.`;

test('e-mail de liberação: data, remetente e os pedidos (sem repetir)', () => {
  const e = lerEmail(EMAIL);
  assert.strictEqual(e.data, '2026-11-25 17:55:00');
  assert.strictEqual(e.de, 'Fulana de Tal - Comercial');
  assert.strictEqual(e.assunto, 'Pedidos Liberados 25/11 - Comercial Até 18h.');
  assert.deepStrictEqual(e.pedidos.map((p) => p.numero), ['217087', '217132', '217251']);
  assert.strictEqual(e.pedidos[2].cliente, 'CLIENTE TRES LTDA');
});

test('data do e-mail nos formatos do Outlook e de outros leitores', () => {
  assert.strictEqual(dataDoEmail('Enviado: quarta-feira, 25 de novembro de 2026 17:55'), '2026-11-25 17:55:00');
  assert.strictEqual(dataDoEmail('Date: 25/11/2026 17:55:10'), '2026-11-25 17:55:10');
  assert.strictEqual(dataDoEmail('Sent: 25/11/26 às 08:05'), '2026-11-25 08:05:00');
  assert.strictEqual(dataDoEmail('sem data aqui'), null);
});
