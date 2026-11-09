// Entrada automática de EDI: leitura do texto, repetição e anexos de e-mail.
const test = require('node:test');
const assert = require('node:assert');
const edi = require('../src/edi/arquivos');
const ent = require('../src/ediEntrada');

const ocoren = edi.montarOcoren({ transportadora: { cnpj: '61222333000140', razao: 'TRANSPORTES ÇÃO' }, ocorrencias: [{ cnpjEmissorNf: '44555666000199', serie: '1', numero: 9, codigo: 1, data: '2026-11-08' }] });

test('EDI automático: texto em ANSI (latin1) ou UTF-8', () => {
  assert.strictEqual(ent.textoDoBuffer(Buffer.from('AÇÃO', 'latin1')), 'AÇÃO');
  assert.strictEqual(ent.textoDoBuffer(Buffer.from('AÇÃO', 'utf8')), 'AÇÃO');
});

test('EDI automático: o mesmo arquivo dá o mesmo hash (mesmo com \\r\\n e espaço no fim)', () => {
  assert.strictEqual(ent.hashDe(ocoren), ent.hashDe(`${ocoren.replace(/\r\n/g, '\n')}\n`));
  assert.notStrictEqual(ent.hashDe(ocoren), ent.hashDe(ocoren.replace('9', '8')));
});

test('EDI automático: só os anexos EDI do e-mail (não PDF, XML ou texto comum)', () => {
  const email = { attachments: [
    { filename: 'OCOREN.TXT', contentType: 'text/plain', content: Buffer.from(ocoren, 'latin1') },
    { filename: 'leia-me.txt', contentType: 'text/plain', content: Buffer.from('Bom dia, segue o arquivo.') },
    { filename: 'nota.xml', contentType: 'application/xml', content: Buffer.from('<nfeProc/>') },
    { filename: 'boleto.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF') },
    { filename: 'OCOREN.EDI', contentType: 'application/octet-stream', content: Buffer.from(ocoren, 'latin1') },
  ] };
  assert.deepStrictEqual(ent.anexosEdi(email).map((a) => a.nome), ['OCOREN.TXT', 'OCOREN.EDI']);
});
