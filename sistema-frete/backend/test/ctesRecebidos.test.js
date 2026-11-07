// CT-e recebidos: leitura completa do XML (remetente, cidades, modal, CFOP, ICMS) e o DACTE.
const test = require('node:test');
const assert = require('node:assert');
const { parseCTe } = require('../src/utils/xmlParser');
const { dadosDacte } = require('../src/ctesRecebidos');
const { gerarDacte } = require('../src/cte/dacte');

const xml = ({ icms = '<ICMS00><CST>00</CST><vBC>1500.00</vBC><pICMS>12.00</pICMS><vICMS>180.00</vICMS></ICMS00>', modal = '01', prot = true } = {}) => `<?xml version="1.0" encoding="UTF-8"?><cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe35261099000111000155570010000001231000001239" versao="4.00">
<ide><CFOP>6352</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>123</nCT><dhEmi>2026-10-10T08:00:00-03:00</dhEmi><tpAmb>1</tpAmb><tpCTe>0</tpCTe>
<modal>${modal}</modal><tpServ>2</tpServ><xMunIni>CAMPINAS</xMunIni><UFIni>SP</UFIni><xMunFim>CURITIBA</xMunFim><UFFim>PR</UFFim><toma3><toma>0</toma></toma3></ide>
<compl><xObs>Entregar no horario comercial</xObs></compl>
<emit><CNPJ>99000111000155</CNPJ><IE>111222333</IE><xNome>TRANSPORTES ALFA</xNome><enderEmit><xLgr>RUA A</xLgr><nro>10</nro><xBairro>CENTRO</xBairro><xMun>CAMPINAS</xMun><UF>SP</UF></enderEmit></emit>
<rem><CNPJ>11222333000181</CNPJ><xNome>INDUSTRIA BETA</xNome><enderReme><xLgr>AV B</xLgr><nro>5</nro><xMun>CAMPINAS</xMun><UF>SP</UF></enderReme></rem>
<dest><CNPJ>44555666000199</CNPJ><xNome>ATACADO GAMA</xNome><enderDest><xMun>CURITIBA</xMun><UF>PR</UF></enderDest></dest>
<vPrest><vTPrest>1500.00</vTPrest><vRec>1500.00</vRec><Comp><xNome>FRETE PESO</xNome><vComp>1400.00</vComp></Comp><Comp><xNome>GRIS</xNome><vComp>100.00</vComp></Comp></vPrest>
<imp><ICMS>${icms}</ICMS></imp>
<infCTeNorm><infCarga><vCarga>50000.00</vCarga><proPred>PECAS</proPred><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>800.0000</qCarga></infQ></infCarga>
<infDoc><infNFe><chave>35261011222333000181550010000700011000700017</chave></infNFe></infDoc><infModal><rodo><RNTRC>12345678</RNTRC></rodo></infModal></infCTeNorm>
</infCte></CTe>${prot ? '<protCTe><infProt><nProt>135260000012345</nProt><dhRecbto>2026-10-10T08:01:00-03:00</dhRecbto><cStat>100</cStat></infProt></protCTe>' : ''}</cteProc>`;

test('lê remetente, município de origem, modal, CFOP e ICMS do CT-e', () => {
  const p = parseCTe(xml());
  assert.strictEqual(p.remetente_nome, 'INDUSTRIA BETA');
  assert.strictEqual(p.remetente_doc, '11222333000181');
  assert.strictEqual(p.cidade_inicio, 'CAMPINAS');
  assert.strictEqual(p.cidade_fim, 'CURITIBA');
  assert.strictEqual(p.modal, '01');
  assert.strictEqual(p.cfop, '6352');
  assert.strictEqual(p.serie_cte, '1');
  assert.deepStrictEqual([p.icms_cst, p.icms_base, p.icms_aliquota, p.icms_valor], ['00', 1500, 12, 180]);
});

test('ICMS de outra UF e Simples Nacional também entram nos campos', () => {
  const o = parseCTe(xml({ icms: '<ICMSOutraUF><CST>90</CST><vBCOutraUF>1000</vBCOutraUF><pICMSOutraUF>7</pICMSOutraUF><vICMSOutraUF>70</vICMSOutraUF></ICMSOutraUF>' }));
  assert.deepStrictEqual([o.icms_cst, o.icms_base, o.icms_aliquota, o.icms_valor], ['OUTRAUF', 1000, 7, 70]);
  const sn = parseCTe(xml({ icms: '<ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN>' }));
  assert.deepStrictEqual([sn.icms_cst, sn.icms_valor], ['SN', null]);
});

test('DACTE do CT-e recebido: participantes, valores, modal e tarja de cancelado', async () => {
  const { d, reg } = dadosDacte(xml({ modal: '02' }));
  assert.strictEqual(reg.chave, '35261099000111000155570010000001231000001239');
  assert.strictEqual(reg.protocolo, '135260000012345');
  assert.strictEqual(d.modalNome, 'AÉREO');
  assert.strictEqual(d.remetente.xNome, 'INDUSTRIA BETA');
  const html = await gerarDacte(d, reg);
  assert.match(html, /MODAL AÉREO/);
  assert.match(html, /INDUSTRIA BETA/);
  assert.match(html, /ATACADO GAMA/);
  assert.match(html, /1\.500,00/);
  assert.doesNotMatch(html, /CANCELADO/);
  const c = dadosDacte(xml(), { cancelado: true });
  assert.match(await gerarDacte(c.d, c.reg), /CANCELADO/);
});

test('Carta de Correção do CT-e: os campos corrigidos e o protocolo do retorno', () => {
  const { parseEvento } = require('../src/utils/xmlParser');
  const e = parseEvento(`<procEventoCTe><eventoCTe><infEvento><chCTe>35261099000111000155570010000009871000009875</chCTe><dhEvento>2026-10-11T10:00:00-03:00</dhEvento><tpEvento>110110</tpEvento>
    <detEvento><evCCeCTe><descEvento>Carta de Correcao</descEvento><infCorrecao><grupoAlterado>ide</grupoAlterado><campoAlterado>xMunFim</campoAlterado><valorAlterado>CURITIBA</valorAlterado></infCorrecao>
    <xCondUso>A Carta de Correcao e disciplinada</xCondUso></evCCeCTe></detEvento></infEvento></eventoCTe><retEventoCTe><infEvento><cStat>135</cStat><nProt>135260000099999</nProt><dhRegEvento>2026-10-11T10:00:05-03:00</dhRegEvento></infEvento></retEventoCTe></procEventoCTe>`);
  assert.strictEqual(e.textoDetalhe, 'corrigido: ide/xMunFim = CURITIBA');
  assert.strictEqual(e.numeroProtocolo, '135260000099999');
});
