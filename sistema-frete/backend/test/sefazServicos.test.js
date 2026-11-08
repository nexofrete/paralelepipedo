// Serviços da SEFAZ: distribuição de CT-e, consulta de cadastro (IE) e os avisos.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const s = require('../src/sefazServicos');

const ctx = { cnpj: '11222333000181', uf: 'SP', tpAmb: 1 };
const gz = (x) => zlib.gzipSync(Buffer.from(x, 'utf8')).toString('base64');

test('CT-e na SEFAZ: pedido por NSU no namespace do CT-e', () => {
  const c = s.corpoDist(ctx, 12);
  assert.match(c, /^<distDFeInt xmlns="http:\/\/www.portalfiscal.inf.br\/cte" versao="1.00"><tpAmb>1<\/tpAmb><cUFAutor>35<\/cUFAutor><CNPJ>11222333000181<\/CNPJ>/);
  assert.match(c, /<distNSU><ultNSU>000000000000012<\/ultNSU><\/distNSU><\/distDFeInt>$/);
  assert.match(s.corpoDist({ ...ctx, cnpj: '12345678909' }, 0), /<CPF>12345678909<\/CPF>/);
  assert.match(s.URL_DIST[1], /www1\.cte\.fazenda\.gov\.br\/CTeDistribuicaoDFe/);
  assert.match(s.URL_DIST[2], /hom1\.cte\.fazenda\.gov\.br/);
});

test('CT-e na SEFAZ: lê o retorno (docZip com NSU antes ou depois do schema)', () => {
  const cte = '<cteProc><CTe><infCte Id="CTe35261099000111000155570010000001231000001239"></infCte></CTe></cteProc>';
  const ev = '<procEventoCTe><eventoCTe><infEvento><chCTe>35261099000111000155570010000001231000001239</chCTe><tpEvento>110111</tpEvento></infEvento></eventoCTe></procEventoCTe>';
  const ret = `<soap:Body><retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>000000000000005</ultNSU><maxNSU>000000000000009</maxNSU><loteDistDFeInt>`
    + `<docZip NSU="000000000000004" schema="procCTe_v4.00.xsd">${gz(cte)}</docZip><docZip schema="procEventoCTe_v4.00.xsd" NSU="000000000000005">${gz(ev)}</docZip></loteDistDFeInt></retDistDFeInt>`;
  const r = s.lerRetornoDist(ret);
  assert.strictEqual(r.cStat, '138');
  assert.strictEqual(r.ultNSU, 5);
  assert.strictEqual(r.maxNSU, 9);
  assert.deepStrictEqual(r.docs.map((d) => [d.nsu, d.schema]), [[4, 'procCTe_v4.00.xsd'], [5, 'procEventoCTe_v4.00.xsd']]);
  assert.strictEqual(r.docs[0].xml, cte);
  assert.strictEqual(s.lerRetornoDist('<retDistDFeInt><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo></retDistDFeInt>').docs.length, 0);
});

test('Consulta cadastro: pedido CONS-CAD e endereço por UF', () => {
  assert.strictEqual(s.corpoCad({ uf: 'SP', doc: '11222333000181' }),
    '<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>SP</UF><CNPJ>11222333000181</CNPJ></infCons></ConsCad>');
  assert.match(s.corpoCad({ uf: 'MG', doc: '12345678909' }), /<CPF>12345678909<\/CPF>/);
  assert.match(s.urlCadastro('SP'), /nfe\.fazenda\.sp\.gov\.br/);
  assert.match(s.urlCadastro('SC'), /cad\.svrs\.rs\.gov\.br/);
});

test('Consulta cadastro: habilitada, várias inscrições, baixada, não cadastrado, erro', () => {
  const cad = (ie, sit, extra = '') => `<infCad><IE>${ie}</IE><CNPJ>11222333000181</CNPJ><UF>SP</UF><cSit>${sit}</cSit><xNome>EMPRESA X</xNome><xRegApur>NORMAL</xRegApur>${extra}<ender><xMun>CAMPINAS</xMun></ender></infCad>`;
  const um = s.lerRetornoCad(`<retConsCad><infCons><cStat>111</cStat><xMotivo>Uma ocorrência</xMotivo>${cad('123456789', 1)}</infCons></retConsCad>`);
  assert.strictEqual(um.situacao, 'habilitada');
  assert.strictEqual(um.cadastros[0].ie, '123456789');
  assert.strictEqual(um.cadastros[0].municipio, 'CAMPINAS');
  const varias = s.lerRetornoCad(`<retConsCad><infCons><cStat>112</cStat>${cad('111', 0, '<dBaixa>2024-01-01</dBaixa>')}${cad('222', 1)}</infCons></retConsCad>`);
  assert.strictEqual(varias.situacao, 'habilitada');
  assert.strictEqual(varias.cadastros[0].baixa, '2024-01-01');
  assert.strictEqual(s.lerRetornoCad(`<retConsCad><infCons><cStat>111</cStat>${cad('111', 0)}</infCons></retConsCad>`).situacao, 'nao_habilitada');
  assert.strictEqual(s.lerRetornoCad('<retConsCad><infCons><cStat>259</cStat><xMotivo>CNPJ da consulta não cadastrado como contribuinte na UF</xMotivo></infCons></retConsCad>').situacao, 'nao_cadastrado');
  assert.strictEqual(s.lerRetornoCad('<retConsCad><infCons><cStat>999</cStat><xMotivo>Erro</xMotivo></infCons></retConsCad>').situacao, 'indisponivel');
});

test('Consulta cadastro: aviso para a emissão do CT-e', () => {
  assert.strictEqual(s.avisoDoCadastro(null), null);
  assert.strictEqual(s.avisoDoCadastro({ situacao: 'habilitada', uf: 'SP', ie_confere: true, situacao_ie_informada: 'habilitada' }), null);
  assert.match(s.avisoDoCadastro({ situacao: 'nao_habilitada', uf: 'SP' }), /NÃO HABILITADA na SEFAZ SP/);
  assert.match(s.avisoDoCadastro({ situacao: 'habilitada', uf: 'SP', ie_informada: '999', ie_confere: false, cadastros: [{ ie: '123' }] }), /\(999\) não aparece.*123/);
  assert.match(s.avisoDoCadastro({ situacao: 'habilitada', uf: 'MG', ie_informada: '111', ie_confere: true, situacao_ie_informada: 'nao_habilitada' }, 'cliente'), /IE 111 do cliente está NÃO HABILITADA/);
  // Sem a UF oferecer a consulta, não há aviso (não dá para concluir nada).
  assert.strictEqual(s.avisoDoCadastro({ situacao: 'indisponivel', uf: 'AP' }), null);
});

test('Simulador: CT-e de transportadoras e um emitido pela própria empresa; depois, nada novo', async () => {
  const r = await s.simulador.distribuicao({ ...ctx, tpAmb: 2 }, 0);
  assert.strictEqual(r.cStat, '138');
  assert.strictEqual(r.docs.length, 3);
  assert.match(r.docs[0].xml, /<rem><CNPJ>11222333000181<\/CNPJ>/);
  assert.match(r.docs[2].xml, /<emit><CNPJ>11222333000181<\/CNPJ>/);
  const p = require('../src/utils/xmlParser').parseCTe(r.docs[0].xml);
  assert.strictEqual(p.transportador_cnpj, '61222333000140');
  assert.strictEqual(Number(p.valor_frete || p.valor_total_prestacao || p.vTPrest || 1850), 1850);
  const de = await s.simulador.distribuicao({ ...ctx, tpAmb: 2 }, 3);
  assert.strictEqual(de.cStat, '137');
});
