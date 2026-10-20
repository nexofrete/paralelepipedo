// PIX pela API do banco: txid e corpo da cobrança no padrão do Banco Central.
const test = require('node:test');
const assert = require('node:assert');
const { corpoCobranca, novoTxid } = require('../src/faturamento/pixApi');

const cfg = { tipo: 'cobv', multa_pct: 2, juros_pct_mes: 1, validade_apos_vencimento: 30, expiracao_dias: 30 };
const e = { pix_chave: '11.222.333/0001-81' };   // como a tela grava: vai só com os números
const fatura = (x = {}) => ({ id: 7, numero: 15, saldo: 1234.5, tomador_doc: '44555666000199', tomador_nome: 'Cliente SA', vencimento: '2999-12-31', ...x });

test('txid: 26 a 35 letras e números, com o id da fatura', () => {
  const t = novoTxid(7);
  assert.match(t, /^[A-Za-z0-9]{26,35}$/);
  assert.ok(t.startsWith('NXF00000007'));
  assert.notStrictEqual(novoTxid(7), t);
});

test('cobrança com vencimento: devedor, multa, juros e valor com 2 casas', () => {
  const r = corpoCobranca(cfg, fatura(), e);
  assert.strictEqual(r.tipo, 'cobv');
  assert.deepStrictEqual(r.corpo.devedor, { cnpj: '44555666000199', nome: 'Cliente SA' });
  assert.strictEqual(r.corpo.valor.original, '1234.50');
  assert.deepStrictEqual(r.corpo.valor.multa, { modalidade: '2', valorPerc: '2.00' });
  assert.deepStrictEqual(r.corpo.valor.juros, { modalidade: '3', valorPerc: '1.00' });
  assert.strictEqual(r.corpo.calendario.dataDeVencimento, '2999-12-31');
  assert.strictEqual(r.corpo.chave, '11222333000181');
});

test('vencida vai com vencimento hoje; sem CPF/CNPJ válido vira cobrança imediata', () => {
  const r = corpoCobranca(cfg, fatura({ vencimento: '2000-01-01' }), e);
  assert.ok(r.corpo.calendario.dataDeVencimento > '2020-01-01');
  const s = corpoCobranca(cfg, fatura({ tomador_doc: '12ABC34501DE35' }), e);
  assert.strictEqual(s.tipo, 'cob');
  assert.strictEqual(s.corpo.calendario.expiracao, 30 * 86400);
  assert.strictEqual(s.corpo.devedor, undefined);
});
