// Segurança parte C: backup inteiro com senha (cifra em partes) e quais gravações vão para o histórico.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

test('backup protegido: abre com a senha certa, recusa a errada e o arquivo não traz o conteúdo legível', async () => {
  const { cifrarArquivo, decifrarArquivo } = require('../src/backup');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  try {
    const original = path.join(pasta, 'a.zip');
    const conteudo = Buffer.concat([Buffer.from('banco.sql CPF 12345678901 '), crypto.randomBytes(300000)]);
    fs.writeFileSync(original, conteudo);
    await cifrarArquivo(original, path.join(pasta, 'a.nxbk'), 'senha-forte-1');
    const cifrado = fs.readFileSync(path.join(pasta, 'a.nxbk'));
    assert.ok(!cifrado.includes(Buffer.from('12345678901')));
    assert.strictEqual(cifrado.subarray(0, 5).toString(), 'NXBK1');
    await decifrarArquivo(path.join(pasta, 'a.nxbk'), path.join(pasta, 'b.zip'), 'senha-forte-1');
    assert.ok(fs.readFileSync(path.join(pasta, 'b.zip')).equals(conteudo));
    await assert.rejects(decifrarArquivo(path.join(pasta, 'a.nxbk'), path.join(pasta, 'c.zip'), 'errada'), /Senha do backup incorreta/);
    assert.ok(!fs.existsSync(path.join(pasta, 'c.zip')));
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
});

test('histórico: só as gravações das tabelas acompanhadas passam o usuário ao banco', () => {
  const { ehGravacaoAcompanhada } = require('../src/contextoUsuario');
  assert.ok(ehGravacaoAcompanhada('UPDATE fretes SET status = $1 WHERE id = $2'));
  assert.ok(ehGravacaoAcompanhada('  insert into transportadoras (cnpj) values ($1)'));
  assert.ok(ehGravacaoAcompanhada({ text: 'DELETE FROM usuarios WHERE id = $1' }));
  assert.ok(ehGravacaoAcompanhada('WITH x AS (SELECT 1) UPDATE public.clientes SET email = $1'));
  assert.ok(!ehGravacaoAcompanhada('SELECT * FROM fretes'));
  assert.ok(!ehGravacaoAcompanhada('UPDATE fretes_historico SET x = 1'));
  assert.ok(!ehGravacaoAcompanhada('UPDATE sessoes SET ultimo_uso = NOW()'));
});
