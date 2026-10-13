const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pares de chave só do teste (as chaves reais não ficam no repositório).
const lic = crypto.generateKeyPairSync('ed25519');
const srv = crypto.generateKeyPairSync('ed25519');
process.env.CHAVE_PUBLICA_LICENCAS = lic.publicKey.export({ type: 'spki', format: 'pem' });
process.env.CHAVE_PUBLICA_SERVIDOR = srv.publicKey.export({ type: 'spki', format: 'pem' });
const { criarServidor } = require('../servidor');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const chave = (d) => { const buf = Buffer.from(JSON.stringify(d)); return `NXF1.${b64u(buf)}.${b64u(crypto.sign(null, buf, lic.privateKey))}`; };
const lerResp = (t) => { const [, a, s] = t.split('.'); const buf = deB64u(a); assert.ok(crypto.verify(null, buf, srv.publicKey, deB64u(s))); return JSON.parse(buf); };

test('servidor de licenças: confere, bloqueia, renova e pede senha', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
  const senha = 'senha-de-teste-123';
  const s = criarServidor({ senha, chavePrivada: srv.privateKey.export({ type: 'pkcs8', format: 'pem' }), dadosDir: dir });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.address().port}`;
  const auth = { Authorization: `Basic ${Buffer.from(`admin:${senha}`).toString('base64')}`, 'Content-Type': 'application/json' };
  try {
    const d = { v: 1, id: 'abc123', cliente: 'TESTE', cnpj: '11222333000181', maquina: 'AAAAA-BBBBB-CCCCC-DDDDD', emitida: '2026-01-01', validade: '2026-12-31', online: true };
    const verificar = (body) => fetch(`${base}/api/verificar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    let r = await verificar({ chave: chave(d), codigo: 'aaaaabbbbbcccccddddd', versao: '1.0' });
    assert.strictEqual(r.status, 200);
    let p = lerResp((await r.json()).resposta);
    assert.deepStrictEqual([p.id, p.maquina, p.status, p.validade], ['abc123', 'AAAAA-BBBBB-CCCCC-DDDDD', 'ativa', '2026-12-31']);

    // Outro computador, chave falsificada.
    assert.strictEqual((await verificar({ chave: chave(d), codigo: 'ZZZZZ-BBBBB-CCCCC-DDDDD' })).status, 400);
    const falsa = chave(d).replace(/\.[^.]+$/, `.${b64u(Buffer.alloc(64))}`);
    assert.strictEqual((await verificar({ chave: falsa, codigo: d.maquina })).status, 400);

    // Painel sem senha / senha errada.
    assert.strictEqual((await fetch(`${base}/admin/licencas`)).status, 401);
    assert.strictEqual((await fetch(`${base}/admin/licencas`, { headers: { Authorization: `Basic ${Buffer.from('admin:errada').toString('base64')}` } })).status, 401);

    const lista = await (await fetch(`${base}/admin/licencas`, { headers: auth })).json();
    assert.strictEqual(lista.length, 1); assert.strictEqual(lista[0].contatos, 1);

    await fetch(`${base}/admin/licencas/abc123`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'bloqueada', mensagem: 'Pague a mensalidade' }) });
    p = lerResp((await (await verificar({ chave: chave(d), codigo: d.maquina })).json()).resposta);
    assert.strictEqual(p.status, 'bloqueada'); assert.strictEqual(p.mensagem, 'Pague a mensalidade');

    await fetch(`${base}/admin/licencas/abc123`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'ativa', validade: '2027-12-31' }) });
    p = lerResp((await (await verificar({ chave: chave(d), codigo: d.maquina })).json()).resposta);
    assert.deepStrictEqual([p.status, p.validade, p.mensagem], ['ativa', '2027-12-31', null]);

    // Guardou no disco.
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'licencas.json'), 'utf8')).abc123.validade, '2027-12-31');
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('servidor recusa chave privada que não é o par', () => {
  const outra = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => criarServidor({ senha: 'senha-de-teste-123', chavePrivada: outra, dadosDir: os.tmpdir() }), /não é o par/);
  assert.throws(() => criarServidor({ senha: 'curta', chavePrivada: outra, dadosDir: os.tmpdir() }), /12 caracteres/);
});
