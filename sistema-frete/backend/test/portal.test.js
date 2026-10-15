// Portal do cliente: documentos do acesso, senha, papel do cliente no CT-e e
// a separação entre o token do portal e o da API interna.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const portal = require('../src/portal');

test('portal: documentos do acesso (texto livre → só números, sem repetir)', () => {
  assert.deepStrictEqual(portal.lerDocumentos('44.555.666/0001-99\n123.456.789-09, 44555666000199'), ['44555666000199', '12345678909']);
  assert.throws(() => portal.lerDocumentos('44.555.666/0001'), /inválido/);
  assert.deepStrictEqual(portal.lerDocumentos(''), []);
});

test('portal: senha nova precisa de 8 caracteres com letras e números', () => {
  assert.throws(() => portal.conferirSenhaNova('abc12'), /8 caracteres/);
  assert.throws(() => portal.conferirSenhaNova('somenteletras'), /letras e números/);
  assert.strictEqual(portal.conferirSenhaNova('Transporte2026'), 'Transporte2026');
  const s = portal.senhaProvisoria();
  assert.strictEqual(s.length, 10);
  assert.doesNotMatch(s, /[0O1lI]/);
});

test('portal: papel do cliente no CT-e e quem paga (raiz do CNPJ vale para as filiais)', () => {
  const u = { documentos: ['44555666000199'], raizes: ['44555666'] };
  const dados = {
    tomador: '3', remetente: { cnpj: '44555666000270', xNome: 'Filial' }, destinatario: { cnpj: '77888999000155', xNome: 'Loja' },
  };
  assert.deepStrictEqual(portal.papeisNoCte(u, dados), { papeis: ['Remetente'], pagador: false });
  assert.deepStrictEqual(portal.papeisNoCte({ ...u, raizes: [] }, dados), { papeis: [], pagador: false });
  const fob = { ...dados, tomador: '0' };
  assert.deepStrictEqual(portal.papeisNoCte(u, fob), { papeis: ['Remetente', 'Pagador'], pagador: true });
  const outro = { tomador: '4', remetente: { cnpj: '11' }, destinatario: { cpf: '123.456.789-09' }, outroTomador: { cnpj: '44.555.666/0001-99' } };
  assert.deepStrictEqual(portal.papeisNoCte(u, outro), { papeis: ['Pagador'], pagador: true });
});

test('portal: token do portal não vale na API interna e vice-versa', () => {
  const doPortal = jwt.sign({ pid: 1, v: 1, tipo: 'portal' }, portal.SEGREDO);
  assert.throws(() => jwt.verify(doPortal, config.jwtSecret));
  const interno = jwt.sign({ id: 1 }, config.jwtSecret);
  assert.throws(() => jwt.verify(interno, portal.SEGREDO));
  assert.notStrictEqual(portal.SEGREDO, config.jwtSecret);
});

test('portal: o filtro SQL cobre todos os papéis do CT-e', () => {
  const sql = portal.condicaoCliente(1);
  ['remetente', 'destinatario', 'expedidor', 'recebedor', 'outroTomador'].forEach((p) => assert.match(sql, new RegExp(`'${p}'`)));
  assert.match(sql, /\$1::text\[\]/);
  assert.match(sql, /\$2::text\[\]/);
});
