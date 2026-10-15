// Cotação de frete: validação, preço combinado no CT-e e texto do WhatsApp.
const test = require('node:test');
const assert = require('node:assert');
const { lerCotacao, aplicarNoCte, textoWhatsapp, situacao, propostaHtml } = require('../src/cotacoes');

const base = { cliente_nome: 'Loja X', origem_cidade: 'Campinas', origem_uf: 'sp', destino_cidade: 'Curitiba', destino_uf: 'PR', peso_kg: '480,5',
  componentes: [{ xNome: 'frete peso', vComp: '246,80' }, { xNome: 'GRIS', vComp: 30.6 }, { xNome: 'PEDAGIO', vComp: 0 }, { xNome: '', vComp: 10 }] };

test('cotação: total é a soma dos componentes válidos', () => {
  const c = lerCotacao(base, { validadeDias: 7 });
  assert.deepStrictEqual(c.componentes, [{ xNome: 'FRETE PESO', vComp: 246.8 }, { xNome: 'GRIS', vComp: 30.6 }]);
  assert.strictEqual(c.valor_total, 277.4);
  assert.strictEqual(c.origem_uf, 'SP');
  assert.strictEqual(c.peso_kg, 480.5);
  assert.match(c.validade, /^\d{4}-\d{2}-\d{2}$/);
});

test('cotação: recusa o que falta', () => {
  assert.throws(() => lerCotacao({ ...base, cliente_nome: '' }), /cliente/);
  assert.throws(() => lerCotacao({ ...base, destino_uf: 'XYZ' }), /destino/);
  assert.throws(() => lerCotacao({ ...base, peso_kg: '', volumes: '', cubagem_m3: '' }), /peso/);
  assert.throws(() => lerCotacao({ ...base, componentes: [] }), /Calcule/);
  assert.throws(() => lerCotacao({ ...base, email: 'sem-arroba' }), /E-mail/);
  assert.throws(() => lerCotacao({ ...base, cliente_doc: '123' }), /CNPJ/);
});

test('cotação aprovada: o CT-e sai com o preço combinado e o ICMS recalculado', () => {
  const dados = { inicio: { UF: 'SP' }, fim: { UF: 'PR' }, icms: { cst: '00' }, valores: { vTPrest: 364, componentes: [{ xNome: 'FRETE PESO', vComp: 364 }] }, avisosImportacao: ['frete não calculado: x'] };
  aplicarNoCte(dados, { id: 9, componentes: [{ xNome: 'FRETE PESO', vComp: 300 }, { xNome: 'GRIS', vComp: 45.8 }] }, { crt: 3 });
  assert.strictEqual(dados.valores.vTPrest, 345.8);
  assert.strictEqual(dados.valores.componentes.length, 2);
  assert.deepStrictEqual([dados.icms.pICMS, dados.icms.vBC, dados.icms.vICMS], [12, 345.8, 41.5]);
  assert.deepStrictEqual(dados.avisosImportacao, ['Valores da cotação nº 9 (preço combinado com o cliente).']);
  // Simples Nacional: sem destaque de ICMS.
  const sn = { inicio: { UF: 'SP' }, fim: { UF: 'SP' } };
  aplicarNoCte(sn, { id: 1, componentes: [{ xNome: 'FRETE PESO', vComp: 100 }] }, { crt: 1 });
  assert.deepStrictEqual(sn.icms, { cst: 'SN' });
});

test('cotação: vencida, proposta e WhatsApp', () => {
  assert.strictEqual(situacao({ status: 'enviada', validade: '2000-01-01' }), 'vencida');
  assert.strictEqual(situacao({ status: 'aprovada', validade: '2000-01-01' }), 'aprovada');
  const c = { id: 7, ...lerCotacao(base), criado_em: new Date() };
  const e = { nome_fantasia: 'Rápido Teste', telefone: '1932101000' };
  assert.match(textoWhatsapp(c, e), /Cotação de frete nº 7 — Rápido Teste[\s\S]*R\$\s?277,40/);
  const html = propostaHtml({ ...c, cliente_nome: '<script>' }, e);
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.ok(html.includes('(19) 3210-1000'));
});
