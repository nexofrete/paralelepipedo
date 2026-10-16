const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { ipPrivado, lerUrl, assinatura } = require('../src/integracao/webhooks');
const { hashDe } = require('../src/integracao/chaves');

test('integracao: IPs internos são reconhecidos', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.strictEqual(ipPrivado(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '200.147.67.142', '2001:4860:4860::8888']) assert.strictEqual(ipPrivado(ip), false, ip);
});

test('integracao: endereço do webhook só https público', () => {
  delete process.env.WEBHOOK_REDE_INTERNA;
  assert.strictEqual(lerUrl('https://erp.exemplo.com.br/hook?x=1'), 'https://erp.exemplo.com.br/hook?x=1');
  for (const u of ['http://erp.exemplo.com.br/hook', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/', 'https://[::1]/x', 'https://a:b@erp.exemplo.com.br/', 'ftp://x.com', 'lixo', 'https://servidor.local/x']) {
    assert.throws(() => lerUrl(u), undefined, u);
  }
  process.env.WEBHOOK_REDE_INTERNA = '1';
  assert.strictEqual(lerUrl('http://192.168.0.10:8080/hook'), 'http://192.168.0.10:8080/hook');
  delete process.env.WEBHOOK_REDE_INTERNA;
});

test('integracao: assinatura HMAC confere com a receita da documentação', () => {
  const corpo = '{"id":"evt_1","evento":"cte.entregue"}';
  const cab = assinatura('whsec_teste', corpo, 1792180000);
  const [t, v1] = cab.split(',').map((p) => p.split('=')[1]);
  assert.strictEqual(t, '1792180000');
  assert.ok(crypto.timingSafeEqual(Buffer.from(v1, 'hex'), crypto.createHmac('sha256', 'whsec_teste').update(`${t}.${corpo}`).digest()));
  assert.notStrictEqual(assinatura('outro', corpo, 1792180000), cab);
});

test('integracao: chave de API guardada só como SHA-256', () => {
  assert.strictEqual(hashDe('nxf_abc').length, 64);
  assert.notStrictEqual(hashDe('nxf_abc'), hashDe('nxf_abd'));
});

test('integracao: na conexão, nome que resolve para IP interno é recusado', async () => {
  delete process.env.WEBHOOK_REDE_INTERNA;
  const { postar } = require('../src/integracao/webhooks');
  const r = await postar('http://localhost:9/x', '{}', {});
  assert.strictEqual(r.status, null);
  assert.match(r.erro, /rede interna/);
});
