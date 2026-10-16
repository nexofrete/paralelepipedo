// Régua de cobrança: qual etapa sai em cada dia, pausas, canais e textos.
const test = require('node:test');
const assert = require('node:assert');
const { decidir, quando, preencher, lerEtapas, celular, ETAPAS_PADRAO } = require('../src/faturamento/regua');

const cfg = { etapas: ETAPAS_PADRAO, janela: 7, email: true, whatsapp: true };
const fat = (vencimento, extra = {}) => ({ id: 1, numero: 1, tomador_nome: 'Cliente', tomador_doc: '1', vencimento, saldo: 100, emails: ['a@b.com'], fone: '+5511987654321', enviados: [], ...extra });
const HOJE = '2026-10-15';

test('régua: etapa do dia — antes, no dia e depois do vencimento', () => {
  assert.strictEqual(decidir(fat('2026-10-18'), cfg, HOJE).etapa, -3);       // vence em 3 dias
  assert.strictEqual(decidir(fat('2026-10-15'), cfg, HOJE).etapa, 0);        // vence hoje
  assert.strictEqual(decidir(fat('2026-10-12'), cfg, HOJE).etapa, 3);        // venceu há 3 dias
  assert.strictEqual(decidir(fat('2026-10-05'), cfg, HOJE).etapa, 10);
  const longe = decidir(fat('2026-10-25'), cfg, HOJE);
  assert.strictEqual(longe.acao, 'aguardar'); assert.match(longe.motivo, /22\/10\/2026/);
});

test('régua: lembrete de antes do vencimento não sai depois que venceu', () => {
  const d = decidir(fat('2026-10-13'), cfg, HOJE);   // 2 dias vencida: o "vence hoje" passou, espera a de 3 dias
  assert.strictEqual(d.acao, 'aguardar'); assert.match(d.motivo, /3 dia\(s\) depois/);
});

test('régua: etapa perdida há mais que a janela não é mandada atrasada', () => {
  assert.strictEqual(decidir(fat('2026-09-01'), cfg, HOJE).acao, 'fora_da_janela');
});

test('régua: já enviada, pausas e canais', () => {
  const enviada = fat('2026-10-12', { enviados: [{ etapa: 3, canal: 'email', status: 'enviado' }, { etapa: 3, canal: 'whatsapp', status: 'enviado' }] });
  assert.strictEqual(decidir(enviada, cfg, HOJE).acao, 'ja_enviada');
  // E-mail foi, WhatsApp deu erro: tenta só o WhatsApp de novo.
  const meio = decidir(fat('2026-10-12', { enviados: [{ etapa: 3, canal: 'email', status: 'enviado' }, { etapa: 3, canal: 'whatsapp', status: 'erro' }] }), cfg, HOJE);
  assert.deepStrictEqual(meio.canais.map((c) => c.canal), ['whatsapp']);
  // Etapa posterior já mandada não manda a anterior.
  assert.strictEqual(decidir(fat('2026-10-12', { enviados: [{ etapa: 10, canal: 'email', status: 'enviado' }, { etapa: 10, canal: 'whatsapp', status: 'enviado' }] }), cfg, HOJE).acao, 'ja_enviada');
  assert.strictEqual(decidir(fat('2026-10-12', { cli_pausado: true, cli_motivo: 'acordo' }), cfg, HOJE).acao, 'pausada');
  assert.strictEqual(decidir(fat('2026-10-12', { pausada_ate: '2026-10-20' }), cfg, HOJE).acao, 'pausada');
  assert.strictEqual(decidir(fat('2026-10-12', { pausada_ate: '2026-10-14' }), cfg, HOJE).acao, 'enviar');   // promessa venceu
  // Só e-mail com contato; WhatsApp sem celular não vira "sem contato".
  assert.deepStrictEqual(decidir(fat('2026-10-12', { fone: null }), cfg, HOJE).canais.map((c) => c.canal), ['email']);
  assert.strictEqual(decidir(fat('2026-10-12', { fone: null, emails: [] }), cfg, HOJE).acao, 'sem_contato');
  // WhatsApp não configurado: canal some.
  assert.deepStrictEqual(decidir(fat('2026-10-12'), cfg, HOJE, { whatsappOk: false }).canais.map((c) => c.canal), ['email']);
});

test('régua: textos com variáveis e {quando}', () => {
  assert.deepStrictEqual([-3, -1, 0, 1, 5].map(quando), ['vence em 3 dias', 'vence amanhã', 'vence hoje', 'venceu ontem', 'venceu há 5 dias']);
  assert.strictEqual(preencher('A fatura {fatura} {quando}. {nada}', { fatura: 7, quando: 'vence hoje' }), 'A fatura 7 vence hoje. {nada}');
});

test('régua: validação das etapas e do celular', () => {
  assert.throws(() => lerEtapas([]), /pelo menos uma/);
  assert.throws(() => lerEtapas([{ dias: 3, titulo: 'a', texto: 'b' }, { dias: '3', titulo: 'c', texto: 'd' }]), /mesmo dia/);
  assert.throws(() => lerEtapas([{ dias: 200, titulo: 'a', texto: 'b' }]), /−30/);
  assert.deepStrictEqual(lerEtapas([{ dias: '5', titulo: ' A ', texto: 'B' }, { dias: -2, titulo: 'C', texto: 'D', ativo: false }]).map((e) => [e.dias, e.ativo, e.titulo]), [[-2, false, 'C'], [5, true, 'A']]);
  assert.strictEqual(celular('(11) 98765-4321'), '+5511987654321');
  assert.strictEqual(celular('+55 11 98765-4321'), '+5511987654321');
  assert.strictEqual(celular('11 3333-4444'), null);   // fixo não recebe WhatsApp
});
