// SAC: leitura do e-mail (sem a parte citada), nº de NF/CT-e citado, palpite do assunto e a assinatura da Twilio.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { semCitacao, refCitada, adivinharAssunto, assinaturaTwilio, SLA_PADRAO } = require('../src/sac');

test('SAC: a resposta por e-mail fica sem o texto citado', () => {
  assert.strictEqual(semCitacao('Obrigada!\n\nEm 20/10/2026 10:00, SAC escreveu:\n> texto antigo\n> mais'), 'Obrigada!');
  assert.strictEqual(semCitacao('Ok, aguardo.\r\n\r\nOn Mon, Oct 20, 2026 at 10:00 AM SAC <sac@x.com> wrote:\r\n> old'), 'Ok, aguardo.');
  assert.strictEqual(semCitacao('Linha 1\n> citada\nLinha 2\n\n\n\nLinha 3'), 'Linha 1\nLinha 2\n\nLinha 3');
  assert.strictEqual(semCitacao('Segue.\n-----Mensagem original-----\nDe: alguém'), 'Segue.');
});

test('SAC: nº da NF/CT-e citado e o assunto pelo texto', () => {
  assert.strictEqual(refCitada('O CT-e 25 está atrasado'), '25');
  assert.strictEqual(refCitada('nota fiscal nº 55 avariada'), '55');
  assert.strictEqual(refCitada('NF-e: 000123'), '000123');
  assert.strictEqual(refCitada('chegaram 25 caixas'), null);
  assert.strictEqual(adivinharAssunto('a NF 1234 não chegou'), 'atraso');
  assert.strictEqual(adivinharAssunto('caixa amassada'), 'avaria');
  assert.strictEqual(adivinharAssunto('preciso da 2ª via do boleto'), 'cobranca');
  assert.strictEqual(adivinharAssunto('cadê o canhoto?'), 'comprovante');
  assert.strictEqual(adivinharAssunto('bom dia'), 'outros');
});

test('SAC: assinatura da Twilio (URL + parâmetros em ordem alfabética, HMAC-SHA1)', () => {
  const url = 'https://exemplo.com.br/api/sac/whatsapp';
  const p = { From: 'whatsapp:+5511999990000', Body: 'Oi', ProfileName: 'Ana' };
  const esperado = crypto.createHmac('sha1', 'tok').update(`${url}BodyOiFromwhatsapp:+5511999990000ProfileNameAna`).digest('base64');
  assert.strictEqual(assinaturaTwilio('tok', url, p), esperado);
  assert.strictEqual(assinaturaTwilio('tok', url, { ProfileName: 'Ana', Body: 'Oi', From: 'whatsapp:+5511999990000' }), esperado);
  assert.notStrictEqual(assinaturaTwilio('outro', url, p), esperado);
});

test('SAC: prazos padrão crescem da urgente para a baixa', () => {
  const ordem = ['urgente', 'alta', 'normal', 'baixa'];
  for (let i = 1; i < ordem.length; i += 1) {
    assert.ok(SLA_PADRAO[ordem[i]].resposta > SLA_PADRAO[ordem[i - 1]].resposta);
    assert.ok(SLA_PADRAO[ordem[i]].solucao > SLA_PADRAO[ordem[i - 1]].solucao);
  }
  for (const p of ordem) assert.ok(SLA_PADRAO[p].solucao > SLA_PADRAO[p].resposta);
});
