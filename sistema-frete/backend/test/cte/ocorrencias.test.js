const test = require('node:test');
const assert = require('node:assert');
const { somarDiasUteis, CATALOGO } = require('../../src/cte/ocorrencias');
const { feriadosNacionais, pascoa } = require('../../src/cte/feriados');

test('previsão em dias úteis pula sábado e domingo', () => {
  assert.strictEqual(somarDiasUteis('2026-10-09', 1), '2026-10-12');   // sexta + 1 = segunda
  assert.strictEqual(somarDiasUteis('2026-10-12', 3), '2026-10-15');   // segunda + 3 = quinta
  assert.strictEqual(somarDiasUteis('2026-10-15', 3), '2026-10-20');   // quinta + 3 = terça
  assert.strictEqual(somarDiasUteis('2026-10-10', 0), '2026-10-10');
});

test('catálogo de ocorrências: ids únicos e códigos PROCEDA de 2 dígitos', () => {
  assert.strictEqual(new Set(CATALOGO.map((c) => c.id)).size, CATALOGO.length);
  CATALOGO.forEach((c) => assert.ok(c.codigo >= 0 && c.codigo <= 99, c.id));
  assert.ok(CATALOGO.some((c) => c.tipo === 'entrega' && c.codigo === 1));
});

test('feriados nacionais: Páscoa e os que dependem dela', () => {
  assert.strictEqual(pascoa(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.strictEqual(pascoa(2027).toISOString().slice(0, 10), '2027-03-28');
  const f = Object.fromEntries(feriadosNacionais(2026).map((x) => [x.descricao, x.data]));
  assert.strictEqual(f['Sexta-feira Santa'], '2026-04-03');
  assert.strictEqual(f['Carnaval (terça)'], '2026-02-17');
  assert.strictEqual(f['Corpus Christi'], '2026-06-04');
  assert.strictEqual(f['Nossa Senhora Aparecida'], '2026-10-12');
});

test('previsão pula feriado: sexta 09/10 + 1 dia útil com o 12/10 = terça 13/10', () => {
  const feriados = new Set(feriadosNacionais(2026).map((x) => x.data));
  assert.strictEqual(somarDiasUteis('2026-10-09', 1, feriados), '2026-10-13');
  assert.strictEqual(somarDiasUteis('2026-11-19', 1, feriados), '2026-11-23');   // 20/11 (sexta) é feriado
});

test('situação: entrega lançada depois com horário anterior ainda vale; devolução depois desfaz', async () => {
  const oc = require('../../src/cte/ocorrencias');
  const rodar = async (lista) => {
    let gravado = null;
    const cliente = { query: async (sql, p) => { if (/^SELECT/.test(sql)) return { rows: lista }; gravado = p; return { rows: [] }; } };
    const sit = await oc.recalcularSituacao(1, cliente);
    return { sit, data: gravado[2] };
  };
  const o = (tipo, h) => ({ tipo, data_hora: `2026-10-12 ${h}`, recebedor_nome: tipo === 'entrega' ? 'Ana' : null });
  assert.deepStrictEqual(await rodar([o('entrega', '15:00'), o('em_rota', '16:00'), o('problema', '18:00')]), { sit: 'entregue', data: '2026-10-12 15:00' });
  assert.strictEqual((await rodar([o('em_rota', '08:00'), o('problema', '11:00')])).sit, 'ocorrencia');
  assert.deepStrictEqual(await rodar([o('entrega', '15:00'), o('devolucao', '17:00')]), { sit: 'devolvido', data: null });
});
