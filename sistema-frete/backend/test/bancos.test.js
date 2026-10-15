// Caixa e bancos: leitor de OFX e regras da conciliação.
const test = require('node:test');
const assert = require('node:assert');
const { lerOfx, valor } = require('../src/bancos/ofx');
const { citaParticipante, formaDoHistorico } = require('../src/bancos/bancos');

const sgml = (trns, extra = '') => Buffer.from(`OFXHEADER:100\r\nDATA:OFXSGML\r\nCHARSET:1252\r\n\r\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>0001<ACCTID>123456<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261016
${trns}
</BANKTRANLIST>${extra}</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`, 'latin1');

test('OFX 1.x (SGML, latin-1): conta, período, saldo e lançamentos assinados', () => {
  const r = lerOfx(sgml(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010120000[-3:BRT]<TRNAMT>-45,90<FITID>A1<MEMO>TARIFA SERVIÇOS</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261012<TRNAMT>1.234,56<FITID>A2<NAME>PIX RECEBIDO<MEMO>CLIENTE X</STMTTRN>`,
  '<LEDGERBAL><BALAMT>4672.91<DTASOF>20261016</LEDGERBAL>'));
  assert.deepStrictEqual(r.conta, { banco: '341', agencia: '0001', numero: '123456', cartao: false });
  assert.strictEqual(r.de, '2026-10-01'); assert.strictEqual(r.ate, '2026-10-16');
  assert.strictEqual(r.saldo, 4672.91); assert.strictEqual(r.saldo_data, '2026-10-16');
  assert.deepStrictEqual(r.lancamentos.map((l) => [l.data, l.valor, l.descricao]), [['2026-10-10', -45.9, 'TARIFA SERVIÇOS'], ['2026-10-12', 1234.56, 'PIX RECEBIDO — CLIENTE X']]);
});

test('OFX 2.x (XML com tags de fechamento) e UTF-8', () => {
  const xml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <BANKACCTFROM><BANKID>001</BANKID><ACCTID>98765-4</ACCTID></BANKACCTFROM><BANKTRANLIST>
    <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261005</DTPOSTED><TRNAMT>-160.00</TRNAMT><FITID>X9</FITID><MEMO>PAGAMENTO ÔNIBUS</MEMO></STMTTRN>
    </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`, 'utf8');
  const r = lerOfx(xml);
  assert.strictEqual(r.conta.banco, '001'); assert.strictEqual(r.conta.numero, '98765-4');
  assert.deepStrictEqual(r.lancamentos[0], { fitid: 'X9', data: '2026-10-05', valor: -160, tipo: 'DEBIT', descricao: 'PAGAMENTO ÔNIBUS', documento: '' });
});

test('OFX: FITID repetido ou ausente vira identificador estável e único', () => {
  const t = '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015<TRNAMT>-620.00<MEMO>POSTO</STMTTRN>';
  const a = lerOfx(sgml(t + t)); const b = lerOfx(sgml(t + t));
  assert.strictEqual(a.lancamentos.length, 2);
  assert.notStrictEqual(a.lancamentos[0].fitid, a.lancamentos[1].fitid);
  assert.deepStrictEqual(a.lancamentos.map((l) => l.fitid), b.lancamentos.map((l) => l.fitid));   // importar de novo não duplica
  const rep = lerOfx(sgml('<STMTTRN><DTPOSTED>20261015<TRNAMT>-1<FITID>0</STMTTRN><STMTTRN><DTPOSTED>20261015<TRNAMT>-2<FITID>0</STMTTRN>'));
  assert.deepStrictEqual(rep.lancamentos.map((l) => l.fitid), ['0', '0#2']);
});

test('OFX: arquivo que não é extrato e valores em vários formatos', () => {
  assert.throws(() => lerOfx(Buffer.from('Data;Valor\n01/10;10')), /não é um extrato OFX/);
  assert.strictEqual(valor('-1.234,56'), -1234.56); assert.strictEqual(valor('1,234.56'), 1234.56);
  assert.strictEqual(valor('-150,00'), -150); assert.strictEqual(valor('3.21'), 3.21); assert.strictEqual(valor(''), null);
});

test('conciliação: o histórico cita o cliente pelo nome ou pela raiz do CNPJ', () => {
  assert.ok(citaParticipante('PIX RECEBIDO 44555666000199 IND MOV', 'Qualquer', '44.555.666/0001-99'));
  assert.ok(citaParticipante('TED RECEBIDA ANDRADE E ABREU', 'ANDRADE E ABREU TRANSPORTES LTDA', ''));
  assert.ok(citaParticipante('PIX ENVIADO JOÃO AGREGADO', 'Joao Agregado', ''));
  assert.ok(!citaParticipante('PIX RECEBIDO TRANSPORTES LTDA', 'ANDRADE TRANSPORTES LTDA', ''));   // palavras genéricas não contam
  assert.ok(!citaParticipante('TARIFA', '', ''));
});

test('conciliação: forma do pagamento pelo histórico do banco', () => {
  assert.strictEqual(formaDoHistorico('PIX RECEBIDO FULANO'), 'pix');
  assert.strictEqual(formaDoHistorico('LIQUIDAÇÃO COBRANÇA'), 'boleto');
  assert.strictEqual(formaDoHistorico('TED RECEBIDA'), 'deposito');
});
