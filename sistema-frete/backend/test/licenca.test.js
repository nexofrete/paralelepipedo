// Licença: só vale chave assinada pelo dono; qualquer alteração invalida.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { montarChave, lerChave, normalizarCodigo, codigoDaMaquina } = require('../src/licenca');

test('chave assinada é lida; alterada ou de outro emissor, não', () => {
  const dono = crypto.generateKeyPairSync('ed25519');
  const outro = crypto.generateKeyPairSync('ed25519');
  const pub = dono.publicKey.export({ type: 'spki', format: 'pem' });
  const dados = { v: 1, cliente: 'TRANSPORTES X', cnpj: '11222333000181', maquina: 'ABCDE-12345-ABCDE-12345', validade: '2027-12-31' };
  const chave = montarChave(dados, dono.privateKey);
  const ok = lerChave(`  ${chave}\n`, pub);
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.dados, dados);
  // Troca a validade no meio da chave: assinatura não confere.
  const [p, d, a] = chave.split('.');
  const mexido = JSON.parse(Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  mexido.validade = '2099-12-31';
  const falsa = `${p}.${Buffer.from(JSON.stringify(mexido)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${a}`;
  assert.strictEqual(lerChave(falsa, pub).ok, false);
  assert.strictEqual(lerChave(montarChave(dados, outro.privateKey), pub).ok, false);
  assert.match(lerChave('qualquer coisa', pub).motivo, /formato inválido/);
});

test('código da máquina: estável e no formato de 4 grupos', () => {
  assert.match(codigoDaMaquina(), /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/);
  assert.strictEqual(codigoDaMaquina(), codigoDaMaquina());
  assert.strictEqual(normalizarCodigo(' abcde 12345-abcde_12345 '), 'ABCDE-12345-ABCDE-12345');
});
