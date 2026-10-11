// Lê de um XML de NF-e o que o CT-e precisa: chave, remetente (emitente da
// nota) e destinatário com endereço e código IBGE, valor, peso, volumes e o
// produto predominante.
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, trimValues: true });
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => (v == null || v === '' ? 0 : Number(String(v).replace(',', '.')) || 0);

function pessoa(p, tagEnder) {
  if (!p) return null;
  const e = p[tagEnder] || {};
  return {
    cnpj: p.CNPJ || null, cpf: p.CPF || null, ie: p.IE || (p.indIEDest === '2' ? 'ISENTO' : null),
    xNome: p.xNome || null, xFant: p.xFant || null, fone: e.fone || null, email: p.email || null,
    endereco: { xLgr: e.xLgr, nro: e.nro, xCpl: e.xCpl, xBairro: e.xBairro, cMun: e.cMun, xMun: e.xMun, CEP: e.CEP, UF: e.UF },
  };
}

function lerNfe(xml) {
  let doc;
  try { doc = parser.parse(String(xml || '')); } catch { throw new Error('Arquivo não é um XML válido.'); }
  const nfe = doc.nfeProc?.NFe || doc.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error('O arquivo não é uma NF-e.');
  const chave = String(inf['@Id'] || '').replace(/^NFe/, '');
  const vols = lista(inf.transp?.vol);
  const produtos = lista(inf.det).map((d) => d.prod || {});
  // Produto predominante: o de maior valor na nota.
  const maior = produtos.slice().sort((a, b) => num(b.vProd) - num(a.vProd))[0];
  return {
    chave,
    numero: inf.ide?.nNF || null,
    serie: inf.ide?.serie || null,
    dataEmissao: inf.ide?.dhEmi || inf.ide?.dEmi || null,
    remetente: pessoa(inf.emit, 'enderEmit'),
    destinatario: pessoa(inf.dest, 'enderDest'),
    // Local de entrega diferente do endereço do destinatário (grupo "entrega").
    entrega: inf.entrega ? { cMun: inf.entrega.cMun, xMun: inf.entrega.xMun, UF: inf.entrega.UF } : null,
    valor: num(inf.total?.ICMSTot?.vNF),
    pesoBruto: vols.reduce((s, v) => s + num(v.pesoB), 0),
    pesoLiquido: vols.reduce((s, v) => s + num(v.pesoL), 0),
    volumes: vols.reduce((s, v) => s + num(v.qVol), 0),
    produtoPredominante: maior?.xProd || null,
    modFrete: inf.transp?.modFrete ?? null,
    transportadoraCnpj: inf.transp?.transporta?.CNPJ || null,
  };
}

module.exports = { lerNfe };
