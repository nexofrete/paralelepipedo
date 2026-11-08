// Segurança das contas: TOTP (vetores da RFC 6238), política de senha e nome do aparelho.
const test = require('node:test');
const assert = require('node:assert');
const c = require('../src/segurancaContas');

test('TOTP: vetores oficiais da RFC 6238 (SHA-1, 6 dígitos)', () => {
  const segredo = c.base32(Buffer.from('12345678901234567890'));
  assert.strictEqual(segredo, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.strictEqual(c.codigoTotp(segredo, Math.floor(59 / 30)), '287082');
  assert.strictEqual(c.codigoTotp(segredo, Math.floor(1111111109 / 30)), '081804');
  assert.strictEqual(c.codigoTotp(segredo, Math.floor(1234567890 / 30)), '005924');
  assert.deepStrictEqual(c.deBase32(segredo), Buffer.from('12345678901234567890'));
});

test('TOTP aceita o código de 30 s antes/depois e recusa os outros', () => {
  const s = c.base32(Buffer.from('abcdefghij0123456789'));
  const agora = 1_700_000_000_000; const passo = Math.floor(agora / 30000);
  assert.strictEqual(c.verificarTotp(s, c.codigoTotp(s, passo), agora), passo);
  assert.strictEqual(c.verificarTotp(s, c.codigoTotp(s, passo - 1), agora), passo - 1);
  assert.strictEqual(c.verificarTotp(s, c.codigoTotp(s, passo + 3), agora), null);
  assert.strictEqual(c.verificarTotp(s, '12', agora), null);
});

test('política de senha', () => {
  const p = { senha_min: 10, senha_variedade: true };
  assert.match(c.problemaDaSenha('abc12345', p), /10 caracteres/);
  assert.match(c.problemaDaSenha('abcdefghijk', p), /letras e números/);
  assert.strictEqual(c.problemaDaSenha('abcdefghi1', p), null);
  assert.strictEqual(c.problemaDaSenha('somenteletras', { senha_min: 8, senha_variedade: false }), null);
  assert.match(c.problemaDaSenha('a1', { senha_min: 4 }), /8 caracteres/);   // nunca menos de 8
  const venc = { senha_validade_dias: 90 };
  assert.ok(c.senhaVencida({ senha_alterada_em: new Date(Date.now() - 91 * 86400000) }, venc));
  assert.ok(!c.senhaVencida({ senha_alterada_em: new Date() }, venc));
  assert.ok(!c.senhaVencida({ senha_alterada_em: new Date(0) }, { senha_validade_dias: 0 }));
});

test('nome do aparelho pelo navegador', () => {
  assert.strictEqual(c.aparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'), 'Chrome no Windows');
  assert.strictEqual(c.aparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), 'Safari no iPhone/iPad');
});
