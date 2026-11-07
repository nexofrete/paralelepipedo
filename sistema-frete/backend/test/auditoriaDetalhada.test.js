// Auditoria em detalhe: nome do componente → parcela da tabela, componente a mais, taxa não prevista,
// parcelas trocadas com o total certo, peso, volumes, ICMS e CFOP.
const test = require('node:test');
const assert = require('node:assert');
const { classificar, conferirFrete } = require('../src/auditoriaDetalhada');

test('nomes dos componentes do CT-e', () => {
  assert.strictEqual(classificar('FRETE PESO'), 'frete_peso');
  assert.strictEqual(classificar('Frete Valor'), 'ad_valorem');
  assert.strictEqual(classificar('ADVALOREM'), 'ad_valorem');
  assert.strictEqual(classificar('G.R.I.S.'), 'gris');
  assert.strictEqual(classificar('GRIS'), 'gris');
  assert.strictEqual(classificar('Pedágio'), 'pedagio');
  assert.strictEqual(classificar('TAXA TDE'), 'tde');
  assert.strictEqual(classificar('SEC/CAT'), 'despacho');
  assert.strictEqual(classificar('TAXA XYZ'), 'outros');
});

const xml = ({ total, peso = 230, comps, vbc, vicms, cfop = '5353', pesoCte = 500, vol = 10, ufFim = 'SP' }) => `<cteProc><CTe><infCte Id="CTe1">
<ide><CFOP>${cfop}</CFOP><nCT>1</nCT><UFIni>SP</UFIni><UFFim>${ufFim}</UFFim></ide>
<vPrest><vTPrest>${total}</vTPrest>${(comps || [['FRETE PESO', peso]]).map(([n, v]) => `<Comp><xNome>${n}</xNome><vComp>${v}</vComp></Comp>`).join('')}</vPrest>
<imp><ICMS><ICMS00><CST>00</CST><vBC>${vbc ?? total}</vBC><pICMS>12</pICMS><vICMS>${vicms ?? (total * 0.12).toFixed(2)}</vICMS></ICMS00></ICMS></imp>
<infCTeNorm><infCarga><infQ><cUnid>01</cUnid><qCarga>${pesoCte}</qCarga></infQ><infQ><cUnid>03</cUnid><qCarga>${vol}</qCarga></infQ></infCarga></infCTeNorm></infCte></CTe></cteProc>`;
const calc = JSON.stringify({ valor_resultado: 230, valor_total_calculado: 302.5, componentes: { adValorem: 30, gris: 20, pedagio: 22.5, tde: 0, tda: 0, trt: 0, despacho: 0, descarga: 0, total: 302.5 } });
const base = { peso_kg: 500, qtd_volumes: 10, uf_inicio_cte: 'SP', uf_fim_cte: 'SP', auditoria_calculo: calc };
const tol = { valor: 0.5, pct: 0 };
const comps = [['FRETE PESO', 230], ['FRETE VALOR', 30], ['GRIS', 35], ['PEDAGIO', 22.5], ['TAXA TDE', 40]];

test('GRIS a mais e TDE não prevista: cobrado a mais limitado ao excesso do total', () => {
  const a = conferirFrete({ ...base, xml_cte_original: xml({ total: 357.5, comps }) }, tol);
  assert.strictEqual(a.a_mais, 55);
  assert.deepStrictEqual(a.apontamentos.map((p) => p.codigo), ['COMPONENTE_A_MAIS', 'TAXA_NAO_PREVISTA']);
  assert.strictEqual(a.componentes.find((c) => c.chave === 'tde').situacao, 'nao_autorizada');
});

test('parcelas trocadas com o total certo: aponta, mas não é cobrado a mais', () => {
  const trocadas = [['FRETE PESO', 175], ['FRETE VALOR', 30], ['GRIS', 35], ['PEDAGIO', 22.5], ['TAXA TDE', 40]];
  const a = conferirFrete({ ...base, xml_cte_original: xml({ total: 302.5, comps: trocadas }) }, tol);
  assert.strictEqual(a.a_mais, 0);
  assert.ok(a.total_confere);
  assert.ok(a.apontamentos.some((p) => /parcelas trocadas/.test(p.texto)));
});

test('peso, volumes, valor do ICMS e CFOP', () => {
  const a = conferirFrete({ ...base, xml_cte_original: xml({ total: 302.5, comps: [['FRETE PESO', 230], ['FRETE VALOR', 30], ['GRIS', 20], ['PEDAGIO', 22.5]], vicms: 40, cfop: '6353', pesoCte: 600, vol: 12 }) }, tol);
  assert.deepStrictEqual(a.apontamentos.map((p) => p.codigo).sort(), ['CFOP', 'ICMS_VALOR', 'PESO', 'VOLUMES']);
  assert.strictEqual(a.icms.valor_esperado, 36.3);
});
