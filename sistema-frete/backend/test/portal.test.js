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

test('portal: valor do frete só para quem tem financeiro e paga o CT-e; DACTE sem valores', async () => {
  const u = { documentos: ['44555666000199'], raizes: [], pode_financeiro: true };
  const pago = { tomador: '0', remetente: { cnpj: '44555666000199' } };
  const deOutro = { tomador: '3', remetente: { cnpj: '44555666000199' }, destinatario: { cnpj: '77888999000155' } };
  assert.strictEqual(portal.veValor(u, pago), true);
  assert.strictEqual(portal.veValor(u, deOutro), false);
  assert.strictEqual(portal.veValor({ ...u, pode_financeiro: false }, pago), false);

  const { gerarDacte } = require('../src/cte/dacte');
  const end = { xLgr: 'RUA A', nro: '1', xBairro: 'C', xMun: 'CAMPINAS', UF: 'SP', CEP: '13010000', cMun: '3509502' };
  const d = {
    emitente: { cnpj: '11222333000181', xNome: 'TRANSP', endereco: end }, remetente: { cnpj: '44555666000199', xNome: 'REM', endereco: end },
    destinatario: { cnpj: '77888999000155', xNome: 'DEST', endereco: end }, inicio: { xMun: 'CAMPINAS', UF: 'SP' }, fim: { xMun: 'SANTOS', UF: 'SP' },
    valores: { vTPrest: 1234.56, vRec: 1234.56, componentes: [{ xNome: 'FRETE PESO', vComp: 1000.5 }] },
    icms: { cst: '00', vBC: 1234.56, pICMS: 12, vICMS: 148.15 }, carga: { vCarga: 5000, proPred: 'DIVERSOS', quantidades: [] },
    observacoes: 'Valor aproximado dos tributos R$ 148,15', nfes: [],
  };
  const reg = { ambiente: 2, status: 'rascunho' };
  const cheio = await gerarDacte(d, reg);
  assert.match(cheio, /1\.234,56/);
  const sem = await gerarDacte(d, reg, { semValores: true });
  assert.doesNotMatch(sem, /1\.234,56|1\.000,50|148,15/);
  assert.match(sem, /não exibidos neste acesso/);
  assert.match(sem, /5\.000,00/);   // valor da carga (da nota do próprio cliente) continua
});
