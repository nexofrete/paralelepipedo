// DANFE no layout do ERP (src/danfe.js): texto das informações complementares, CST com origem, fatura e canhoto.
const test = require('node:test');
const assert = require('node:assert');
const { danfeFolha, linhasDoTexto } = require('../src/danfe');

const XML = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe33261100955719000186550010001946281051705274" versao="4.00">
<ide><natOp>VENDA DE MERCADORIA</natOp><serie>1</serie><nNF>194628</nNF><dhEmi>2026-10-28T12:15:00-03:00</dhEmi><dhSaiEnt>2026-10-28T12:15:00-03:00</dhSaiEnt><tpNF>1</tpNF></ide>
<emit><CNPJ>00955719000186</CNPJ><xNome>EMPRESA TESTE LTDA</xNome><enderEmit><xLgr>AV TESTE</xLgr><nro>816</nro><xBairro>CENTRO</xBairro><xMun>DUQUE DE CAXIAS</xMun><UF>RJ</UF><CEP>25243620</CEP><fone>2135061600</fone></enderEmit><IE>85783963</IE></emit>
<dest><CNPJ>44651148000161</CNPJ><xNome>CLIENTE TESTE LTDA</xNome><enderDest><xLgr>Rua CACAPAVA</xLgr><nro>648</nro><xBairro>CENTRO</xBairro><xMun>CRISSIUMAL</xMun><UF>RS</UF><CEP>98640000</CEP></enderDest><indIEDest>1</indIEDest><IE>330022989</IE></dest>
<det nItem="1"><prod><cProd>AG13</cProd><xProd>BATERIA</xProd><NCM>85065090</NCM><CFOP>6102</CFOP><uCom>UN</uCom><qCom>200.0000</qCom><vUnCom>0.7000000000</vUnCom><vProd>140.00</vProd></prod>
<imposto><ICMS><ICMS00><orig>1</orig><CST>00</CST><vBC>140.00</vBC><pICMS>4.0000</pICMS><vICMS>5.60</vICMS></ICMS00></ICMS><IPI><IPITrib><pIPI>9.75</pIPI><vIPI>13.65</vIPI></IPITrib></IPI></imposto></det>
<total><ICMSTot><vBC>140.00</vBC><vICMS>5.60</vICMS><vProd>140.00</vProd><vIPI>13.65</vIPI><vNF>3590.05</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete><transporta><xNome>EXPRESSO RPA TRANSPORTES LTDA</xNome></transporta><vol><qVol>12</qVol><pesoB>144.296</pesoB></vol></transp>
<cobr><fat><nFat>194628</nFat><vOrig>3590.05</vOrig><vDesc>0.00</vDesc><vLiq>3590.05</vLiq></fat></cobr>
<infAdic><infCpl>${'PALAVRA '.repeat(200)}FIM</infCpl></infAdic></infNFe></NFe>
<protNFe><infProt><nProt>233260521010616</nProt><dhRecbto>2026-10-28T12:16:25-03:00</dhRecbto><cStat>100</cStat></infProt></protNFe></nfeProc>`;

test('informações complementares: linhas de até 86 caracteres, respeitando palavras e o "\\n" escrito como texto', () => {
  const l = linhasDoTexto('ALTERAR ENDERECO: RUA X\\nCASO NAO RECEBA ' + 'ABC '.repeat(40), 86);
  assert.strictEqual(l[0], 'ALTERAR ENDERECO: RUA X');
  assert.ok(l.every((x) => x.length <= 86));
});

test('folha: canhoto com destinatário e valor, CST com origem, fatura, FL e continuação do texto', () => {
  const { folha } = danfeFolha(XML);
  assert.match(folha, /DESTINATÁRIO: CLIENTE TESTE LTDA - RUA CACAPAVA, 648 - CENTRO - CRISSIUMAL - RS - EMISSÃO: 28-10-2026 - VALOR TOTAL: R\$ 3\.590,05/);
  assert.match(folha, /<td class="m">100<\/td>/);
  assert.match(folha, /<td class="n">0,70<\/td>/);
  assert.match(folha, /VALOR ORIGINAL|Valor original/);
  assert.match(folha, /FL 1 \/ 1/);
  assert.match(folha, /1 - Remetente|0 - Remetente/);
  assert.match(folha, /Continuação - Informações complementares/);
  assert.match(folha, /FIM/);
});

test('logo só na nota emitida pela empresa', () => {
  assert.match(danfeFolha(XML, { empresa: { logo: 'data:image/png;base64,AAAA', cnpj: '00.955.719/0001-86' } }).folha, /class="logo"/);
  assert.doesNotMatch(danfeFolha(XML, { empresa: { logo: 'data:image/png;base64,AAAA', cnpj: '11111111000111' } }).folha, /class="logo"/);
});
