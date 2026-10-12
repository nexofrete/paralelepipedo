const test = require('node:test');
const assert = require('node:assert');
const { conferirIcms } = require('../../src/icmsCte');

const imp = (pICMS) => JSON.stringify({ cst: '00', pICMS, aliquotaEsperadaPelaRota: 7 });
const base = { uf_inicio_cte: 'RJ', uf_fim_cte: 'GO', impostos_cte: imp(12), transportadora_cte: 'ANDRADE E ABREU TRANSPORTES LTDA', tp_serv_cte: 0 };

test('sem redespacho: RJ→GO espera 7%', () => {
  const r = conferirIcms(base);
  assert.strictEqual(r.esperada, 7);
  assert.strictEqual(r.divergente, true);
});

test('1ª perna do redespacho: tributa só até a cidade do redespacho (RJ→SP, 12%)', () => {
  const r = conferirIcms({ ...base, icms_nota: { redespacho: 'FAST LOGISTICA E TRANSPORTES LTDA', cidade_redespacho: 'GUARULHOS' } });
  assert.strictEqual(r.fim, 'SP');
  assert.strictEqual(r.esperada, 12);
  assert.strictEqual(r.divergente, false);
  assert.match(r.motivo, /GUARULHOS\/SP/);
});

test('1ª perna cobrando 7% até SP: diverge', () => {
  const r = conferirIcms({ ...base, impostos_cte: imp(7), icms_nota: { redespacho: 'FAST LOGISTICA', cidade_redespacho: 'Guarulhos' } });
  assert.strictEqual(r.esperada, 12);
  assert.strictEqual(r.divergente, true);
});

test('o CT-e da transportadora do redespacho segue o UFIni/UFFim dele', () => {
  const r = conferirIcms({ ...base, uf_inicio_cte: 'SP', impostos_cte: imp(7), transportadora_cte: 'FAST LOGISTICA E TRANSPORTES LTDA',
    icms_nota: { redespacho: 'FAST LOGISTICA E TRANSPORTES LTDA', cidade_redespacho: 'GUARULHOS' } });
  assert.strictEqual(r.fim, 'GO');
  assert.strictEqual(r.divergente, false);
});

test('recebedor do CT-e em outro estado vale como fim do trecho', () => {
  const r = conferirIcms({ ...base, icms_uf_recebedor: 'SP' });
  assert.strictEqual(r.fim, 'SP');
  assert.strictEqual(r.divergente, false);
});

test('redespacho dentro do estado: não confere (alíquota interna)', () => {
  const r = conferirIcms({ ...base, icms_nota: { redespacho: 'X TRANSPORTES', cidade_redespacho: 'DUQUE DE CAXIAS' } });
  assert.strictEqual(r.divergente, false);
  assert.strictEqual(r.esperada, null);
});
